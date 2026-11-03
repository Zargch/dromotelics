// Simulador 2D de autos + red neuronal + algoritmo genético.
// Funciona en el navegador (window.Sim) y en Node (require('./sim.js')).
(function (root) {
  'use strict';

  // ---------- RNG con semilla (reproducible) ----------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rng) {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // ---------- Circuitos ----------
  // Puntos de control de la línea central (lienzo 1000x650) y medio ancho de la pista.
  const TRACKS = {
    facil: {
      nombre: 'Fácil', halfWidth: 45,
      control: [[160, 140], [500, 100], [840, 140], [910, 325], [840, 510], [500, 550], [160, 510], [90, 325]]
    },
    media: {
      nombre: 'Media', halfWidth: 30,
      control: [
        [130, 110], [430, 85], [540, 175], [600, 180], [690, 90], [880, 105],
        [940, 250], [860, 320], [770, 325], [750, 400], [905, 470], [840, 590],
        [600, 575], [540, 440], [460, 435], [390, 570], [170, 585], [75, 440],
        [180, 370], [190, 295], [85, 230]
      ]
    },
    dificil: {
      nombre: 'Difícil', halfWidth: 22,
      control: [
        [150, 75], [250, 80], [300, 115], [300, 225], [332, 262], [368, 225], [368, 115], [420, 80],
        [560, 80], [620, 125], [680, 95], [740, 125], [860, 85], [925, 140], [925, 250], [880, 295],
        [770, 295], [730, 332], [770, 370], [880, 370], [930, 420], [915, 560], [850, 600], [730, 600],
        [672, 560], [672, 455], [636, 418], [600, 455], [600, 560], [545, 600], [430, 600], [372, 560],
        [372, 455], [336, 418], [300, 455], [300, 560], [245, 600], [115, 600], [70, 545], [75, 450],
        [128, 370], [82, 285], [128, 200], [92, 120]
      ]
    }
  };
  // Compatibilidad con la versión anterior
  const CONTROL = TRACKS.media.control, HALF_WIDTH = TRACKS.media.halfWidth;

  function buildTrack(control, halfWidth, spacing) {
    spacing = spacing || 10;
    // Catmull-Rom cerrada muestreada fino
    const dense = [];
    const n = control.length;
    for (let i = 0; i < n; i++) {
      const p0 = control[(i - 1 + n) % n], p1 = control[i], p2 = control[(i + 1) % n], p3 = control[(i + 2) % n];
      for (let k = 0; k < 40; k++) {
        const t = k / 40, t2 = t * t, t3 = t2 * t;
        dense.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
        ]);
      }
    }
    // Remuestreo a distancia uniforme
    const pts = [dense[0]];
    let acc = 0;
    for (let i = 1; i <= dense.length; i++) {
      const a = dense[i - 1], b = dense[i % dense.length];
      let seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let ax = a[0], ay = a[1];
      while (acc + seg >= spacing) {
        const r = (spacing - acc) / seg;
        ax += (b[0] - ax) * r; ay += (b[1] - ay) * r;
        pts.push([ax, ay]);
        seg = Math.hypot(b[0] - ax, b[1] - ay);
        acc = 0;
      }
      acc += seg;
    }
    if (Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]) < spacing * 0.5) pts.pop();

    const N = pts.length;
    const cum = new Float64Array(N + 1);
    for (let i = 0; i < N; i++) {
      const a = pts[i], b = pts[(i + 1) % N];
      cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    const L = cum[N];
    const left = [], right = [];
    for (let i = 0; i < N; i++) {
      const a = pts[(i - 1 + N) % N], b = pts[(i + 1) % N];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const l = Math.hypot(dx, dy); dx /= l; dy /= l;
      left.push([pts[i][0] - dy * halfWidth, pts[i][1] + dx * halfWidth]);
      right.push([pts[i][0] + dy * halfWidth, pts[i][1] - dx * halfWidth]);
    }
    // Curvatura por punto: radio mínimo y curvatura total (dificultad)
    let minR = Infinity, totalTurn = 0, tightTurn = 0;
    const radius = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const a = pts[(i - 2 + N) % N], b = pts[i], c = pts[(i + 2) % N];
      const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
      const area2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
      const r = area2 > 1e-9 ? (ab * bc * ca) / (2 * area2) : Infinity;
      radius[i] = r;
      if (r < minR) minR = r;
    }
    for (let i = 0; i < N; i++) {
      const a = pts[(i - 1 + N) % N], b = pts[i], c = pts[(i + 1) % N];
      let d = Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]);
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      totalTurn += Math.abs(d);
      if (radius[i] < 3 * halfWidth) tightTurn += cum[i + 1] - cum[i];
    }
    // Separación mínima entre tramos no vecinos (las paredes no deben tocarse)
    let minGap = Infinity;
    for (let i = 0; i < N; i += 2) for (let j = i + 1; j < N; j += 2) {
      let arc = Math.abs(cum[i] - cum[j]); arc = Math.min(arc, L - arc);
      if (arc < 6 * halfWidth) continue;
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
      if (d < minGap) minGap = d;
    }
    const startAngle = Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]);
    return {
      pts, left, right, cum, N, length: L, halfWidth, minR, minGap, radius,
      totalTurnDeg: totalTurn * 180 / Math.PI, tightShare: tightTurn / L, startAngle
    };
  }

  // ---------- Red neuronal (feed-forward, tanh) ----------
  const RAY_ANGLES = [-Math.PI / 2, -Math.PI / 4, -Math.PI / 8, 0, Math.PI / 8, Math.PI / 4, Math.PI / 2];
  const N_IN = RAY_ANGLES.length + 1; // rayos + velocidad
  const N_OUT = 2; // dirección, acelerador/freno
  const genomeSize = nHid => N_IN * nHid + nHid + nHid * N_OUT + N_OUT;
  const GENOME = genomeSize(10);

  function forward(g, inp, out, nHid, hid) {
    let k = 0;
    for (let h = 0; h < nHid; h++) {
      let s = 0;
      for (let i = 0; i < N_IN; i++) s += g[k++] * inp[i];
      hid[h] = Math.tanh(s + g[k++]);
    }
    for (let o = 0; o < N_OUT; o++) {
      let s = 0;
      for (let h = 0; h < nHid; h++) s += g[k++] * hid[h];
      out[o] = Math.tanh(s + g[k++]);
    }
  }

  // ---------- Física ----------
  const DT = 1 / 60;
  const P = {
    accel: 320, brake: 500, maxSpeed: 280, drag: 0.4, turnRate: 3.2,
    rayLen: 220, carRadius: 6, stallSteps: 150, stallDist: 25, window: 30
  };

  function raySeg(ox, oy, dx, dy, ax, ay, bx, by) {
    const ex = bx - ax, ey = by - ay;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) return Infinity;
    const qx = ax - ox, qy = ay - oy;
    const t = (qx * ey - qy * ex) / den;
    const u = (qx * dy - qy * dx) / den;
    if (t >= 0 && u >= 0 && u <= 1) return t;
    return Infinity;
  }

  function createCar(track, genome, nHid, laps, record) {
    return {
      x: track.pts[0][0], y: track.pts[0][1], a: track.startAngle, v: 0,
      idx: 0, s: 0, best: 0, lastBest: 0, stall: 0, vSum: 0,
      alive: true, finished: false, finishStep: -1, steps: 0, cause: null, crashS: -1,
      laps: laps || 1, lapSteps: [], nHid: nHid || 10, hid: new Float64Array(nHid || 10),
      genome, rays: new Float64Array(RAY_ANGLES.length), inp: new Float64Array(N_IN), out: new Float64Array(N_OUT),
      path: record ? [] : null
    };
  }

  // Busca el segmento de línea central más cercano alrededor del índice actual
  function locate(track, car) {
    const N = track.N, pts = track.pts;
    let bestD = Infinity, bestI = car.idx, bestT = 0;
    for (let o = -12; o <= 12; o++) {
      const i = (car.idx + o + N) % N, j = (i + 1) % N;
      const ax = pts[i][0], ay = pts[i][1], ex = pts[j][0] - ax, ey = pts[j][1] - ay;
      const L2 = ex * ex + ey * ey;
      let t = ((car.x - ax) * ex + (car.y - ay) * ey) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + ex * t - car.x, py = ay + ey * t - car.y;
      const d = px * px + py * py;
      if (d < bestD) { bestD = d; bestI = i; bestT = t; }
    }
    return { i: bestI, t: bestT, d: Math.sqrt(bestD) };
  }

  function sense(track, car) {
    const N = track.N, L = track.left, R = track.right;
    for (let r = 0; r < RAY_ANGLES.length; r++) {
      const ang = car.a + RAY_ANGLES[r], dx = Math.cos(ang), dy = Math.sin(ang);
      let best = P.rayLen;
      for (let o = -P.window; o <= P.window; o++) {
        const i = (car.idx + o + N) % N, j = (i + 1) % N;
        let t = raySeg(car.x, car.y, dx, dy, L[i][0], L[i][1], L[j][0], L[j][1]);
        if (t < best) best = t;
        t = raySeg(car.x, car.y, dx, dy, R[i][0], R[i][1], R[j][0], R[j][1]);
        if (t < best) best = t;
      }
      car.rays[r] = best;
    }
  }

  function kill(track, car, cause) {
    car.alive = false; car.cause = cause;
    car.crashS = ((car.s % track.length) + track.length) % track.length;
  }

  function stepCar(track, car) {
    if (!car.alive || car.finished) return;
    sense(track, car);
    for (let r = 0; r < RAY_ANGLES.length; r++) car.inp[r] = car.rays[r] / P.rayLen;
    if (car.sensorNoise) { // solo en pruebas de robustez: ruido gaussiano en cada rayo, recortado a [0, 1]
      for (let r = 0; r < RAY_ANGLES.length; r++) car.inp[r] = Math.min(1, Math.max(0, car.inp[r] + gauss(car.noiseRng) * car.sensorNoise));
    }
    car.inp[RAY_ANGLES.length] = car.v / P.maxSpeed;
    forward(car.genome, car.inp, car.out, car.nHid, car.hid);
    const steer = car.out[0], thr = car.out[1];

    car.v += (thr >= 0 ? thr * P.accel : thr * P.brake) * DT;
    car.v -= car.v * P.drag * DT;
    if (car.v < 0) car.v = 0;
    if (car.v > P.maxSpeed) car.v = P.maxSpeed;
    car.a += steer * P.turnRate * DT * Math.min(1, car.v / 60);
    car.x += Math.cos(car.a) * car.v * DT;
    car.y += Math.sin(car.a) * car.v * DT;
    car.steps++;
    car.vSum += car.v;
    if (car.path && car.steps % 3 === 0) car.path.push([Math.round(car.x), Math.round(car.y)]);
    if (car.onStep) car.onStep(car, steer, thr);

    const loc = locate(track, car);
    // progreso continuo (desenrollado sobre vueltas)
    const sMod = track.cum[loc.i] + loc.t * (track.cum[loc.i + 1] - track.cum[loc.i]);
    const prevMod = ((car.s % track.length) + track.length) % track.length;
    let ds = sMod - prevMod;
    if (ds > track.length / 2) ds -= track.length;
    if (ds < -track.length / 2) ds += track.length;
    car.s += ds;
    car.idx = loc.i;
    if (car.s > car.best) {
      if (Math.floor(car.s / track.length) > Math.floor(car.best / track.length)) car.lapSteps.push(car.steps);
      car.best = car.s;
    }

    if (loc.d > track.halfWidth - P.carRadius) return kill(track, car, 'muro');
    if (car.s < -40) return kill(track, car, 'reversa');
    if (++car.stall >= P.stallSteps) {
      if (car.best - car.lastBest < P.stallDist) return kill(track, car, 'atasco');
      car.stall = 0; car.lastBest = car.best;
    }
    if (car.best >= track.length * car.laps) { car.finished = true; car.finishStep = car.steps; }
  }

  // Prueba en solitario de un genoma: vueltas completadas, tiempos y trayectoria opcional.
  // opts (opcional): { sensorNoise: desviación del ruido en los rayos normalizados, seed, onStep(car, volante, acelerador) }
  function testDrive(track, genome, nHid, laps, maxSteps, record, opts) {
    const car = createCar(track, genome, nHid, laps, record);
    if (opts && opts.sensorNoise) { car.sensorNoise = opts.sensorNoise; car.noiseRng = mulberry32(opts.seed || 1); }
    if (opts && opts.onStep) car.onStep = opts.onStep;
    maxSteps = maxSteps || 3600 * laps;
    while (car.alive && !car.finished && car.steps < maxSteps) stepCar(track, car);
    if (car.alive && !car.finished) car.cause = 'tiempo';
    return {
      laps: Math.floor(car.best / track.length), progress: car.best / track.length, finished: car.finished,
      time: car.finished ? car.finishStep * DT : null,
      lapTimes: car.lapSteps.map((s, i) => (s - (i ? car.lapSteps[i - 1] : 0)) * DT),
      avgSpeed: car.steps ? car.vSum / car.steps : 0, cause: car.finished ? null : car.cause,
      crashS: car.crashS, path: car.path
    };
  }

  function fitness(track, car, maxSteps) {
    let f = car.best;
    if (car.finished) f = track.length * car.laps + (maxSteps - car.finishStep) * 2; // bonus por terminar rápido
    return Math.max(0, f);
  }

  function randomGenome(rng, nHid) {
    const g = new Float64Array(genomeSize(nHid));
    for (let k = 0; k < g.length; k++) g[k] = gauss(rng);
    return g;
  }

  // ---------- Algoritmo genético ----------
  function Evolution(opts) {
    this.rng = mulberry32(opts.seed || 1);
    this.pop = opts.pop || 50;
    this.elite = opts.elite || Math.max(2, Math.round(this.pop * 0.1));
    this.mutRate = opts.mutRate != null ? opts.mutRate : 0.1;
    this.mutStd = opts.mutStd != null ? opts.mutStd : 0.4;
    this.maxSteps = opts.maxSteps || 60 * 60 * (opts.laps || 1);
    this.nHid = opts.nHid || 10;
    this.laps = opts.laps || 1; // vueltas que se evalúan por generación
    this.track = opts.track;
    this.gen = 1;
    this.genomes = [];
    for (let p = 0; p < this.pop; p++) this.genomes.push(randomGenome(this.rng, this.nHid));
    this.startGen();
  }
  Evolution.prototype.startGen = function () {
    this.cars = this.genomes.map(g => createCar(this.track, g, this.nHid, this.laps));
    this.step = 0;
  };
  Evolution.prototype.tick = function () {
    let active = 0;
    for (const c of this.cars) { stepCar(this.track, c); if (c.alive && !c.finished) active++; }
    this.step++;
    return active > 0 && this.step < this.maxSteps;
  };
  Evolution.prototype.runGen = function () { while (this.tick()); return this.endGen(); };
  Evolution.prototype.endGen = function () {
    const rng = this.rng, T = this.track, M = this.maxSteps;
    const scored = this.cars.map(c => ({ c, f: fitness(T, c, M) })).sort((a, b) => b.f - a.f);
    const prog = scored.map(x => Math.min(1, x.c.best / T.length));
    const fin = scored.filter(x => x.c.finished);
    const causes = { muro: 0, atasco: 0, reversa: 0, tiempo: 0 };
    const crashS = [];
    for (const x of scored) {
      if (x.c.finished) continue;
      if (x.c.alive) causes.tiempo++;
      else { causes[x.c.cause]++; if (x.c.cause === 'muro') crashS.push(x.c.crashS); }
    }
    // diversidad genética: desviación estándar media por gen
    const G = this.genomes[0].length;
    let div = 0;
    for (let k = 0; k < G; k++) {
      let m = 0, m2 = 0;
      for (const g of this.genomes) { m += g[k]; m2 += g[k] * g[k]; }
      m /= this.pop; div += Math.sqrt(Math.max(0, m2 / this.pop - m * m));
    }
    const sortedProg = prog.slice().sort((a, b) => a - b);
    const stats = {
      gen: this.gen,
      best: scored[0].f,
      bestProgress: prog[0],
      avgProgress: prog.reduce((s, x) => s + x, 0) / prog.length,
      medianProgress: sortedProg[Math.floor(sortedProg.length / 2)],
      finishers: fin.length,
      oneLap: scored.filter(x => x.c.best >= T.length).length,
      bestLapTime: fin.length ? Math.min(...fin.map(x => x.c.finishStep)) * DT : null,
      avgLapTime: fin.length ? fin.reduce((s, x) => s + x.c.finishStep, 0) / fin.length * DT : null,
      diversity: div / G,
      causes, crashS,
      bestGenome: Float64Array.from(scored[0].c.genome)
    };
    const tour = () => {
      let b = scored[Math.floor(rng() * scored.length)];
      for (let k = 0; k < 2; k++) { const o = scored[Math.floor(rng() * scored.length)]; if (o.f > b.f) b = o; }
      return b.c.genome;
    };
    const next = [];
    for (let e = 0; e < this.elite; e++) next.push(Float64Array.from(scored[e].c.genome));
    while (next.length < this.pop) {
      const a = tour(), b = tour(), g = new Float64Array(G);
      for (let k = 0; k < G; k++) {
        g[k] = rng() < 0.5 ? a[k] : b[k];
        if (rng() < this.mutRate) g[k] += gauss(rng) * this.mutStd;
      }
      next.push(g);
    }
    this.genomes = next;
    this.gen++;
    this.startGen();
    return stats;
  };

  const api = {
    buildTrack, TRACKS, CONTROL, HALF_WIDTH, Evolution, testDrive, randomGenome, genomeSize,
    RAY_ANGLES, N_IN, N_OUT, P, DT, GENOME, mulberry32
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sim = api;
})(typeof self !== 'undefined' ? self : this);
