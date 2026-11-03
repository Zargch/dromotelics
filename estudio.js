// Estudio completo en paralelo (worker_threads). Cada resultado se agrega a resultados/raw.jsonl.
// Uso: node estudio.js [semillas=20] [generaciones=1000] [experimento opcional: main|mut|hid|random|laps2]
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs'), os = require('os'), path = require('path');
const S = require('./sim.js');

const TRACK_KEYS = ['facil', 'media', 'dificil'];
const SNAP_GENS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];
const CRASH_BINS = 60;
const r3 = x => x == null ? null : Math.round(x * 1000) / 1000;

function buildTracks() {
  const T = {};
  for (const k of TRACK_KEYS) T[k] = S.buildTrack(S.TRACKS[k].control, S.TRACKS[k].halfWidth, 10);
  return T;
}

// ---------- trabajos ----------
function runEvolution(T, job) {
  const track = T[job.track];
  const ev = new S.Evolution({ track, seed: job.seed, pop: job.pop, mutRate: job.mutRate, nHid: job.nHid, laps: job.laps });
  const out = {
    exp: job.exp, track: job.track, pop: job.pop, seed: job.seed, mutRate: job.mutRate ?? 0.1, nHid: job.nHid ?? 10, laps: job.laps ?? 1, gens: job.gens,
    bp: [], ap: [], mp: [], fin: [], blt: [], alt: [], div: [], muro: [], atasco: [], reversa: [], tiempo: [],
    firstLap: null, half: null, all90: null, reliable: null, champ: [], snaps: [],
    crashEarly: new Array(CRASH_BINS).fill(0), crashLate: new Array(CRASH_BINS).fill(0)
  };
  const t0 = Date.now();
  for (let g = 1; g <= job.gens; g++) {
    const s = ev.runGen();
    out.bp.push(r3(s.bestProgress)); out.ap.push(r3(s.avgProgress)); out.mp.push(r3(s.medianProgress));
    out.fin.push(s.finishers); out.blt.push(r3(s.bestLapTime)); out.alt.push(r3(s.avgLapTime)); out.div.push(r3(s.diversity));
    out.muro.push(s.causes.muro); out.atasco.push(s.causes.atasco); out.reversa.push(s.causes.reversa); out.tiempo.push(s.causes.tiempo);
    if (out.firstLap == null && s.oneLap > 0) out.firstLap = g; // primera vuelta completa, aunque se evalúen 2
    if (out.half == null && s.finishers >= job.pop / 2) out.half = g;
    if (out.all90 == null && s.finishers >= job.pop * 0.9) out.all90 = g;
    const bins = out.firstLap == null || g <= out.firstLap ? out.crashEarly : out.crashLate;
    for (const c of s.crashS) bins[Math.min(CRASH_BINS - 1, Math.floor(c / track.length * CRASH_BINS))]++;
    // Piloto confiable: el mejor de la generación da 5 vueltas seguidas solo, sin chocar
    const testNow = (out.firstLap != null && out.reliable == null) || g % 10 === 0;
    if (testNow) {
      const r = S.testDrive(track, s.bestGenome, ev.nHid, 5);
      if (r.finished && out.reliable == null) out.reliable = g;
      if (g % 10 === 0) out.champ.push(r.laps);
    }
    if (job.snaps && (SNAP_GENS.includes(g) || g === out.firstLap && s.finishers > 0 && out.snaps.every(x => x.gen !== g))) {
      const r = S.testDrive(track, s.bestGenome, ev.nHid, 1, 3600, true);
      out.snaps.push({ gen: g, progress: r3(r.progress), path: r.path });
    }
    if (g === job.gens) {
      const r = S.testDrive(track, s.bestGenome, ev.nHid, 5);
      out.final = { laps: r.laps, lapTimes: r.lapTimes.map(r3), avgSpeed: r3(r.avgSpeed), cause: r.cause };
      out.genome = Array.from(s.bestGenome, x => Math.round(x * 1e4) / 1e4);
    }
  }
  out.ms = Date.now() - t0;
  return out;
}

// Búsqueda aleatoria: redes al azar evaluadas una por una, sin evolución
function runRandom(T, job) {
  const track = T[job.track], rng = S.mulberry32(job.seed);
  let best = 0, found = null;
  const curve = [];
  for (let i = 1; i <= job.maxEvals; i++) {
    const r = S.testDrive(track, S.randomGenome(rng, 10), 10, 1, 3600);
    if (r.progress > best) best = r.progress;
    if (r.finished && found == null) found = i;
    if (i % 50 === 0) curve.push(r3(Math.min(1, best)));
    if (found != null && i >= 50 * Math.ceil(found / 50)) break;
  }
  return { exp: 'random', track: job.track, seed: job.seed, maxEvals: job.maxEvals, found, curve };
}

if (!isMainThread) {
  const T = buildTracks();
  parentPort.on('message', job => {
    const res = job.exp === 'random' ? runRandom(T, job) : runEvolution(T, job);
    parentPort.postMessage(res);
  });
} else {
  const SEEDS = +process.argv[2] || 20;
  const GENS = +process.argv[3] || 1000;
  const dir = path.join(__dirname, 'resultados');
  fs.mkdirSync(dir, { recursive: true });
  const rawFile = path.join(dir, 'raw.jsonl');
  const done = new Set();
  if (fs.existsSync(rawFile)) for (const l of fs.readFileSync(rawFile, 'utf8').split('\n')) if (l) { const o = JSON.parse(l); done.add(key(o)); }
  function key(o) { return [o.exp, o.track, o.pop, o.seed, o.mutRate, o.nHid, o.laps ?? 1].join('|'); }

  const jobs = [];
  const seedOf = (s, salt) => s * 7919 + salt;
  // A. Principal: 3 pistas × 3 poblaciones × semillas × 1000 generaciones
  for (const track of TRACK_KEYS) for (const pop of [20, 50, 100]) for (let s = 1; s <= SEEDS; s++)
    jobs.push({ exp: 'main', track, pop, seed: seedOf(s, pop), gens: GENS, snaps: s === 1 && pop === 50 });
  // B. Tasa de mutación (300 generaciones)
  for (const track of ['media', 'dificil']) for (const mutRate of [0.02, 0.05, 0.2, 0.4]) for (let s = 1; s <= SEEDS; s++)
    jobs.push({ exp: 'mut', track, pop: 50, seed: seedOf(s, 500), mutRate, gens: 300 });
  // C. Tamaño de la capa oculta (300 generaciones)
  for (const track of ['media', 'dificil']) for (const nHid of [3, 5, 20, 40]) for (let s = 1; s <= SEEDS; s++)
    jobs.push({ exp: 'hid', track, pop: 50, seed: seedOf(s, 700), nHid, gens: 300 });
  // D. Búsqueda aleatoria: tantas evaluaciones como 1000 generaciones × 50 individuos
  for (const track of TRACK_KEYS) for (let s = 1; s <= SEEDS; s++)
    jobs.push({ exp: 'random', track, seed: seedOf(s, 900), maxEvals: 50 * GENS });
  // F. La aptitud evalúa 2 vueltas (mismas semillas que A con 50 autos, comparación pareada)
  for (const track of TRACK_KEYS) for (let s = 1; s <= SEEDS; s++)
    jobs.push({ exp: 'laps2', track, pop: 50, seed: seedOf(s, 50), gens: GENS, laps: 2 });
  // Los trabajos largos primero para repartir mejor la carga
  jobs.sort((a, b) => (b.pop || 0) * (b.gens || 0) - (a.pop || 0) * (a.gens || 0));
  for (const j of jobs) { if (j.mutRate == null && j.exp !== 'random') j.mutRate = 0.1; if (j.nHid == null && j.exp !== 'random') j.nHid = 10; }
  const only = process.argv[4]; // opcional: correr solo un experimento
  const pending = jobs.filter(j => !only || j.exp === only).filter(j => !done.has(key({ ...j, mutRate: j.mutRate, nHid: j.nHid })));

  const nWorkers = Math.max(1, os.cpus().length - 1);
  console.log(`${jobs.length} trabajos (${jobs.length - pending.length} ya hechos), ${nWorkers} hilos`);
  let next = 0, finished = 0;
  const t0 = Date.now(), out = fs.createWriteStream(rawFile, { flags: 'a' });
  for (let w = 0; w < Math.min(nWorkers, pending.length); w++) {
    const worker = new Worker(__filename);
    const feed = () => { if (next < pending.length) worker.postMessage(pending[next++]); else worker.terminate(); };
    worker.on('message', res => {
      out.write(JSON.stringify(res) + '\n');
      finished++;
      const el = (Date.now() - t0) / 1000;
      console.log(`[${finished}/${pending.length}] ${res.exp} ${res.track} pop=${res.pop ?? '-'} mut=${res.mutRate ?? '-'} hid=${res.nHid ?? '-'} semilla=${res.seed} → 1ª vuelta ${res.firstLap ?? res.found ?? '—'}, confiable ${res.reliable ?? '—'} (${el.toFixed(0)} s)`);
      feed();
    });
    worker.on('error', e => { console.error(e); process.exitCode = 1; });
    feed();
  }
}
