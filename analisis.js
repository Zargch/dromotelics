// Análisis estadístico de resultados/raw.jsonl → resumen.json, CSVs y figdata.json
const fs = require('fs'), path = require('path');
const S = require('./sim.js');
const dir = path.join(__dirname, 'resultados');
const raw = fs.readFileSync(path.join(dir, 'raw.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const TRACKS = ['facil', 'media', 'dificil'], POPS = [20, 50, 100];
const T = {};
for (const k of TRACKS) T[k] = S.buildTrack(S.TRACKS[k].control, S.TRACKS[k].halfWidth, 10);

// ---------- utilidades estadísticas ----------
const rng = S.mulberry32(12345);
const sorted = a => a.slice().sort((x, y) => x - y);
// Percentil con interpolación; con fallos (+∞) devuelve +∞ en lugar de NaN (∞ − ∞), que desordenaba el bootstrap
const q = (s, p) => { if (!s.length) return null; const i = p * (s.length - 1), lo = Math.floor(i), hi = Math.ceil(i); if (lo === hi) return s[lo]; if (s[hi] === Infinity) return Infinity; return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const r1 = x => x == null || !isFinite(x) ? null : Math.round(x * 10) / 10;
const r3 = x => x == null || !isFinite(x) ? null : Math.round(x * 1000) / 1000;
const fp = p => p < 0.0001 ? '<0.0001' : p < 0.001 ? '<0.001' : r3(p); // formato de valores p
// Mediana con censura: los fallos valen +Infinito (peor que cualquier éxito)
function censored(values, cap) {
  const v = values.map(x => x == null ? Infinity : x), s = sorted(v), ok = v.filter(isFinite);
  const med = q(s, 0.5);
  const boot = [];
  for (let b = 0; b < 2000; b++) { const r = []; for (let i = 0; i < v.length; i++) r.push(v[Math.floor(rng() * v.length)]); boot.push(q(sorted(r), 0.5)); }
  const bs = sorted(boot);
  return {
    n: v.length, exito: ok.length, tasa: r3(ok.length / v.length),
    mediana: isFinite(med) ? r1(med) : null, p25: isFinite(q(s, 0.25)) ? r1(q(s, 0.25)) : null, p75: isFinite(q(s, 0.75)) ? r1(q(s, 0.75)) : null,
    min: ok.length ? Math.min(...ok) : null, max: ok.length ? Math.max(...ok) : null,
    ic95: [isFinite(q(bs, 0.025)) ? r1(q(bs, 0.025)) : null, isFinite(q(bs, 0.975)) ? r1(q(bs, 0.975)) : `>${cap}`],
    tasa_ic95: wilson(ok.length, v.length),
    media_exitos: ok.length ? r1(mean(ok)) : null
  };
}
// Intervalo de Wilson al 95% para una proporción k/n
function wilson(k, n) {
  if (!n) return null;
  const z = 1.959964, p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [r3(Math.max(0, c - h)), r3(Math.min(1, c + h))];
}
// Mann-Whitney U (bilateral, aproximación normal con corrección por empates)
function mannWhitney(a, b) {
  const A = a.map(x => x == null ? Infinity : x), B = b.map(x => x == null ? Infinity : x);
  const all = A.map(v => ({ v, g: 0 })).concat(B.map(v => ({ v, g: 1 }))).sort((x, y) => x.v - y.v);
  let i = 0, tie = 0;
  while (i < all.length) { let j = i; while (j + 1 < all.length && all[j + 1].v === all[i].v) j++; const r = (i + j) / 2 + 1; for (let k = i; k <= j; k++) all[k].r = r; const t = j - i + 1; tie += t * t * t - t; i = j + 1; }
  const n1 = A.length, n2 = B.length, R1 = all.filter(x => x.g === 0).reduce((s, x) => s + x.r, 0);
  const U = R1 - n1 * (n1 + 1) / 2, mu = n1 * n2 / 2, N = n1 + n2;
  const sd = Math.sqrt(n1 * n2 / 12 * ((N + 1) - tie / (N * (N - 1))));
  const z = sd ? (U - mu) / sd : 0;
  const p = 2 * (1 - normCdf(Math.abs(z)));
  // efecto = A de Vargha-Delaney = P(A > B) + ½·P(A = B); 0,5 = sin diferencia (con fallos = +∞, mayor = peor)
  return { U, z: r3(z), p: fp(p), pBruto: p, efecto: r3(U / (n1 * n2)) };
}
// Corrección de Holm-Bonferroni sobre una familia de pruebas
function holm(tests) {
  const ks = Object.keys(tests).sort((a, b) => tests[a].pBruto - tests[b].pBruto), m = ks.length;
  let prev = 0;
  ks.forEach((k, i) => { prev = Math.max(prev, Math.min(1, (m - i) * tests[k].pBruto)); tests[k].pHolm = fp(prev); tests[k].significativaHolm = prev < 0.05; });
  return m;
}
function normCdf(x) { const t = 1 / (1 + 0.2316419 * x), d = 0.3989423 * Math.exp(-x * x / 2); return 1 - d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); }

const sel = f => raw.filter(f);
const main = (track, pop) => sel(r => r.exp === 'main' && r.track === track && r.pop === pop);
const resumen = { generado: new Date().toISOString(), pistas: {}, principal: {}, pruebas: {}, mutacion: {}, red: {}, aleatoria: {}, transferencia: {}, curvas: {} };

for (const k of TRACKS) resumen.pistas[k] = { longitud: r1(T[k].length), ancho: 2 * T[k].halfWidth, radioMin: r1(T[k].minR), giro: r1(T[k].totalTurnDeg) };

// ---------- A. principal ----------
const GENS = Math.max(...raw.filter(r => r.exp === 'main').map(r => r.gens)); // 1000 en el estudio; menos en la prueba reducida
for (const k of TRACKS) for (const pop of POPS) {
  const runs = main(k, pop); if (!runs.length) continue;
  const lastLap = runs.map(r => r.blt.at(-1)).filter(x => x != null);
  const lapAt = g => sorted(runs.map(r => r.blt[g - 1]).filter(x => x != null));
  resumen.principal[`${k}_${pop}`] = {
    pista: k, pop, corridas: runs.length,
    primeraVuelta: censored(runs.map(r => r.firstLap), GENS),
    primeraVueltaEvals: censored(runs.map(r => r.firstLap && r.firstLap * pop), GENS * pop),
    mitad: censored(runs.map(r => r.half), GENS),
    noventa: censored(runs.map(r => r.all90), GENS),
    confiable: censored(runs.map(r => r.reliable), GENS),
    confiableEvals: censored(runs.map(r => r.reliable && r.reliable * pop), GENS * pop),
    vueltaMejor: { g10: r1(q(lapAt(10), 0.5)), g50: r1(q(lapAt(50), 0.5)), g100: r1(q(lapAt(100), 0.5)), g250: r1(q(lapAt(250), 0.5)), g500: r1(q(lapAt(500), 0.5)), g1000: r1(q(sorted(lastLap), 0.5)), min1000: lastLap.length ? r1(Math.min(...lastLap)) : null },
    finalCampeon5vueltas: runs.filter(r => r.final && r.final.laps >= 5).length,
    finalTerminan: r3(q(sorted(runs.map(r => r.fin.at(-1) / pop)), 0.5)),
    segundosPorCorrida: r1(mean(runs.map(r => r.ms)) / 1000)
  };
}
// Pruebas de significancia
const mw = (a, b, f) => mannWhitney(a.map(f), b.map(f));
for (const k of TRACKS) {
  resumen.pruebas[`${k}: pop20 vs pop50 (1ª vuelta, generaciones)`] = mw(main(k, 20), main(k, 50), r => r.firstLap);
  resumen.pruebas[`${k}: pop50 vs pop100 (1ª vuelta, generaciones)`] = mw(main(k, 50), main(k, 100), r => r.firstLap);
  resumen.pruebas[`${k}: pop20 vs pop100 (1ª vuelta, evaluaciones)`] = mw(main(k, 20), main(k, 100), r => r.firstLap && r.firstLap * r.pop);
}
resumen.pruebas['pop50: fácil vs media (1ª vuelta)'] = mw(main('facil', 50), main('media', 50), r => r.firstLap);
resumen.pruebas['pop50: media vs difícil (1ª vuelta)'] = mw(main('media', 50), main('dificil', 50), r => r.firstLap);
resumen.pruebas['pop50: media vs difícil (confiable)'] = mw(main('media', 50), main('dificil', 50), r => r.reliable);

// ---------- curvas por generación (mediana entre semillas) ----------
const genIdx = []; for (let g = 1; g <= GENS; g++) if (g <= 100 || g % 10 === 0) genIdx.push(g);
const curvas = [];
for (const k of TRACKS) for (const pop of POPS) {
  const runs = main(k, pop); if (!runs.length) continue;
  for (const g of genIdx) {
    const col = f => sorted(runs.map(f).filter(x => x != null));
    const bp = col(r => r.bp[g - 1]), ap = col(r => r.ap[g - 1]), fin = col(r => r.fin[g - 1] / pop), lt = col(r => r.blt[g - 1]), dv = col(r => r.div[g - 1]);
    const muro = mean(runs.map(r => r.muro[g - 1] / pop)), atasco = mean(runs.map(r => (r.atasco[g - 1] + r.reversa[g - 1]) / pop));
    curvas.push({ pista: k, pop, gen: g, mejor: r3(q(bp, 0.5)), mejor_p25: r3(q(bp, 0.25)), mejor_p75: r3(q(bp, 0.75)), promedio: r3(q(ap, 0.5)), terminan: r3(q(fin, 0.5)), terminan_p25: r3(q(fin, 0.25)), terminan_p75: r3(q(fin, 0.75)), vuelta_s: lt.length >= runs.length / 2 ? r3(q(lt, 0.5)) : null, diversidad: r3(q(dv, 0.5)), choques: r3(muro), atascos: r3(atasco) });
  }
}
fs.writeFileSync(path.join(dir, 'curvas.csv'), toCsv(curvas));
// Confiabilidad del campeón en el tiempo (cada 10 generaciones)
const champ = [];
for (const k of TRACKS) for (const pop of POPS) {
  const runs = main(k, pop); if (!runs.length) continue;
  for (let i = 0; i < GENS / 10; i++) champ.push({ pista: k, pop, gen: (i + 1) * 10, campeon_5_vueltas: r3(runs.filter(r => r.champ[i] >= 5).length / runs.length) });
}
// F. Aptitud de 2 vueltas contra 1 vuelta (mismas semillas, 50 autos)
resumen.dosVueltas = {};
for (const k of TRACKS) {
  const runs = sel(r => r.exp === 'laps2' && r.track === k);
  if (!runs.length) continue;
  for (let i = 0; i < GENS / 10; i++) champ.push({ pista: k, pop: '50 (2 vueltas)', gen: (i + 1) * 10, campeon_5_vueltas: r3(runs.filter(r => r.champ[i] >= 5).length / runs.length) });
  const ref = main(k, 50), lap1 = r => r.blt.at(-1);
  resumen.dosVueltas[k] = {
    corridas: runs.length,
    primeraVuelta: censored(runs.map(r => r.firstLap), GENS),
    confiable: censored(runs.map(r => r.reliable), GENS),
    final5vueltas: runs.filter(r => r.final.laps >= 5).length, final5vueltas_1vuelta: ref.filter(r => r.final.laps >= 5).length,
    vuelta1Final: r1(q(sorted(runs.map(r => r.final.lapTimes.at(0)).filter(x => x != null)), 0.5)),
    vuelta1Final_1vuelta: r1(q(sorted(ref.map(r => r.final.lapTimes.at(0)).filter(x => x != null)), 0.5)),
    segundaVueltaFinal: r1(q(sorted(runs.map(r => r.final.lapTimes.at(1)).filter(x => x != null)), 0.5))
  };
  resumen.pruebas[`${k}: 1 vuelta vs 2 vueltas (1ª vuelta, generaciones)`] = mannWhitney(ref.map(r => r.firstLap), runs.map(r => r.firstLap));
  resumen.pruebas[`${k}: 1 vuelta vs 2 vueltas (vueltas del campeón final)`] = mannWhitney(ref.map(r => r.final.laps), runs.map(r => r.final.laps));
}
// Media móvil de 5 puntos (50 generaciones) por serie: la curva que muestra el artículo
for (const row of champ) {
  const serie = champ.filter(x => x.pista === row.pista && x.pop === row.pop), i = serie.indexOf(row);
  const w = serie.slice(Math.max(0, i - 2), i + 3);
  row.media_movil_50 = r3(mean(w.map(x => x.campeon_5_vueltas)));
}
fs.writeFileSync(path.join(dir, 'campeon.csv'), toCsv(champ));

// ---------- B y C. mutación y tamaño de red (300 generaciones) ----------
const cap300 = (r, key) => r[key] != null && r[key] <= 300 ? r[key] : null;
for (const track of ['media', 'dificil']) {
  const ref = main(track, 50);
  for (const m of [0.02, 0.05, 0.1, 0.2, 0.4]) {
    const runs = m === 0.1 ? ref : sel(r => r.exp === 'mut' && r.track === track && r.mutRate === m);
    if (runs.length) resumen.mutacion[`${track}_${m}`] = { pista: track, mutacion: m, primeraVuelta: censored(runs.map(r => cap300(r, 'firstLap')), 300), confiable: censored(runs.map(r => cap300(r, 'reliable')), 300), mitad: censored(runs.map(r => cap300(r, 'half')), 300) };
  }
  for (const h of [3, 5, 10, 20, 40]) {
    const runs = h === 10 ? ref : sel(r => r.exp === 'hid' && r.track === track && r.nHid === h);
    if (runs.length) resumen.red[`${track}_${h}`] = { pista: track, ocultas: h, pesos: S.genomeSize(h), primeraVuelta: censored(runs.map(r => cap300(r, 'firstLap')), 300), confiable: censored(runs.map(r => cap300(r, 'reliable')), 300), mitad: censored(runs.map(r => cap300(r, 'half')), 300) };
  }
}

// Pruebas de los experimentos B y C (límite de 300 generaciones; las corridas sin hito cuentan como fallos)
for (const track of ['media', 'dificil']) {
  const mut = m => sel(r => r.exp === 'mut' && r.track === track && r.mutRate === m), hid = h => h === 10 ? main(track, 50) : sel(r => r.exp === 'hid' && r.track === track && r.nHid === h);
  resumen.pruebas[`${track}: mutación 0,02 vs 0,4 (1ª vuelta)`] = mannWhitney(mut(0.02).map(r => cap300(r, 'firstLap')), mut(0.4).map(r => cap300(r, 'firstLap')));
  resumen.pruebas[`${track}: mutación 0,02 vs 0,4 (50% termina)`] = mannWhitney(mut(0.02).map(r => cap300(r, 'half')), mut(0.4).map(r => cap300(r, 'half')));
  resumen.pruebas[`${track}: 3 vs 10 neuronas ocultas (1ª vuelta)`] = mannWhitney(hid(3).map(r => cap300(r, 'firstLap')), hid(10).map(r => cap300(r, 'firstLap')));
  resumen.pruebas[`${track}: 10 vs 40 neuronas ocultas (50% termina)`] = mannWhitney(hid(10).map(r => cap300(r, 'half')), hid(40).map(r => cap300(r, 'half')));
}

// ---------- D. búsqueda aleatoria vs evolución (mejor progreso vs evaluaciones) ----------
const evalCurve = [];
for (const k of TRACKS) {
  const rnd = sel(r => r.exp === 'random' && r.track === k);
  if (rnd.length) {
    resumen.aleatoria[k] = { evaluaciones: censored(rnd.map(r => r.found), 50000), generacionesEquivalentes50: censored(rnd.map(r => r.found && Math.ceil(r.found / 50)), 1000) };
    resumen.pruebas[`${k}: evolución pop50 vs aleatoria (evaluaciones hasta 1ª vuelta)`] = mannWhitney(main(k, 50).map(r => r.firstLap && r.firstLap * 50), rnd.map(r => r.found));
  }
  const pts = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  for (const e of pts) {
    const row = { pista: k, evaluaciones: e };
    if (rnd.length) row.aleatoria = r3(q(sorted(rnd.map(r => r.curve[Math.min(r.curve.length, e / 50) - 1] ?? 1)), 0.5));
    for (const pop of POPS) {
      const runs = main(k, pop), g = Math.floor(e / pop);
      if (runs.length && g >= 1) row[`evolucion_${pop}`] = r3(q(sorted(runs.map(r => Math.max(...r.bp.slice(0, Math.min(g, GENS))))), 0.5));
    }
    evalCurve.push(row);
  }
}
fs.writeFileSync(path.join(dir, 'evaluaciones.csv'), toCsv(evalCurve));

// ---------- E. transferencia: campeones finales (pop 50) en las otras pistas ----------
const matriz = [];
for (const from of TRACKS) for (const to of TRACKS) {
  const runs = main(from, 50).filter(r => r.genome);
  if (!runs.length) continue;
  const res = runs.map(r => S.testDrive(T[to], Float64Array.from(r.genome), r.nHid, 5));
  const cell = { entrenada: from, probada: to, vuelta1: r3(res.filter(x => x.laps >= 1).length / res.length), cinco: r3(res.filter(x => x.finished).length / res.length), progresoMediano: r3(q(sorted(res.map(x => Math.min(5, x.progress))), 0.5)) };
  matriz.push(cell);
}
resumen.transferencia = matriz;
fs.writeFileSync(path.join(dir, 'transferencia.csv'), toCsv(matriz));

// ---------- datos para figuras ----------
const fig = { pistas: {}, choques: {}, snaps: {}, campeon: {} };
for (const k of TRACKS) {
  fig.pistas[k] = { pts: T[k].pts.map(p => p.map(Math.round)), left: T[k].left.map(p => p.map(Math.round)), right: T[k].right.map(p => p.map(Math.round)), halfWidth: T[k].halfWidth };
  const runs = sel(r => r.exp === 'main' && r.track === k);
  fig.choques[k] = { early: runs.reduce((acc, r) => acc.map((v, i) => v + r.crashEarly[i]), new Array(60).fill(0)), late: runs.reduce((acc, r) => acc.map((v, i) => v + r.crashLate[i]), new Array(60).fill(0)) };
  const sn = runs.find(r => r.snaps && r.snaps.length);
  if (sn) fig.snaps[k] = { seed: sn.seed, firstLap: sn.firstLap, snaps: sn.snaps };
  const best = main(k, 50).filter(r => r.genome).sort((a, b) => (a.blt.at(-1) ?? 1e9) - (b.blt.at(-1) ?? 1e9))[0];
  if (best) { const r = S.testDrive(T[k], Float64Array.from(best.genome), best.nHid, 1, 3600, true); fig.campeon[k] = { seed: best.seed, time: r.time, path: r.path }; }
}
fs.writeFileSync(path.join(dir, 'figdata.json'), JSON.stringify(fig));
// Configuración completa del estudio: cada corrida de raw.jsonl guarda exp, pista, pop, semilla, mutRate, nHid, laps y gens;
// aquí quedan los parámetros fijos y la huella del código que produjo los datos
const ev0 = new S.Evolution({ track: T.media, seed: 1, pop: 50 });
const config = {
  datosGeneradosCon: { simSha256: '6b04df238a146455e0ca736b13b79e063219a79ed33d696a85b50504d6fb836b', nota: 'sim.js 1.0.0; la 1.1.0 solo agrega opciones de prueba (ruido en sensores, onStep) que no alteran la simulación, verificado reproduciendo corridas guardadas' },
  node: process.version, simSha256: require('crypto').createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'sim.js'))).digest('hex'),
  fisica: { ...S.P, dt: S.DT },
  red: { entradas: S.N_IN, salidas: S.N_OUT, ocultasPorDefecto: ev0.nHid, activacion: 'tanh', angulosRayosGrados: S.RAY_ANGLES.map(a => Math.round(a * 180 / Math.PI * 10) / 10), pesosConOcultas10: S.genomeSize(10) },
  algoritmoGenetico: { elite: '10% (mínimo 2)', eliteCon50: ev0.elite, torneo: 3, cruce: 'uniforme', mutRate: ev0.mutRate, mutStd: ev0.mutStd, pesosIniciales: 'N(0, 1)', pasosMaxPorVuelta: 3600, semillaPrincipal: 's × 7919 + pop (s = 1…20)' },
  pistas: Object.fromEntries(TRACKS.map(k => [k, { ...resumen.pistas[k], medioAncho: S.TRACKS[k].halfWidth, puntosControl: S.TRACKS[k].control }])),
  corridasPorExperimento: raw.reduce((acc, r) => (acc[r.exp] = (acc[r.exp] || 0) + 1, acc), {})
};
fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config, null, 1));

// Corrección por comparaciones múltiples sobre todas las pruebas de Mann-Whitney del estudio
resumen.pruebasCorreccion = { metodo: 'Holm-Bonferroni', familia: holm(resumen.pruebas), alfa: 0.05 };
for (const k in resumen.pruebas) delete resumen.pruebas[k].pBruto;
// Proporciones de campeones finales con 5 vueltas (IC de Wilson)
for (const k in resumen.dosVueltas) {
  const d = resumen.dosVueltas[k];
  d.final5vueltas_ic95 = wilson(d.final5vueltas, d.corridas);
  d.final5vueltas_1vuelta_ic95 = wilson(d.final5vueltas_1vuelta, 20);
}
fs.writeFileSync(path.join(dir, 'resumen.json'), JSON.stringify(resumen, null, 1));
console.log(JSON.stringify(resumen, null, 1));

function toCsv(rows) {
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  return cols.join(',') + '\n' + rows.map(r => cols.map(c => r[c] ?? '').join(',')).join('\n') + '\n';
}
