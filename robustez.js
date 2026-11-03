// Robustez de los campeones finales: ¿siguen conduciendo si se perturban sus pesos o sus sensores?
// Compara el experimento A (aptitud de 1 vuelta, 50 autos) con el F (aptitud de 2 vueltas).
// Uso: node robustez.js → resultados/robustez.json
const fs = require('fs'), path = require('path');
const S = require('./sim.js');
const raw = fs.readFileSync(path.join(__dirname, 'resultados', 'raw.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const WEIGHT_NOISE = [0, 0.001, 0.003, 0.01];   // ruido uniforme ±x sumado a cada peso
const SENSOR_NOISE = [0.02, 0.05, 0.1];         // desviación del ruido gaussiano en cada rayo (rayos normalizados 0–1)
const REPS = 10;
const r3 = x => Math.round(x * 1000) / 1000;
function wilson(k, n) {
  const z = 1.959964, p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [r3(Math.max(0, c - h)), r3(Math.min(1, c + h))];
}
const out = [];
function record(base, one, five, n) {
  out.push({ ...base, pruebas: n, unaVuelta: r3(one / n), unaVuelta_ic95: wilson(one, n), cincoVueltas: r3(five / n), cincoVueltas_ic95: wilson(five, n) });
  console.log(out.at(-1));
}
for (const track of ['facil', 'media', 'dificil']) {
  const T = S.buildTrack(S.TRACKS[track].control, S.TRACKS[track].halfWidth, 10);
  for (const exp of ['main', 'laps2']) {
    const runs = raw.filter(r => r.exp === exp && r.track === track && r.pop === 50 && r.genome);
    if (!runs.length) continue;
    const experimento = exp === 'main' ? 'aptitud 1 vuelta' : 'aptitud 2 vueltas';
    for (const noise of WEIGHT_NOISE) {
      const rng = S.mulberry32(4242);
      let one = 0, five = 0, n = 0;
      for (const r of runs) for (let k = 0; k < (noise ? REPS : 1); k++) {
        const g = Float64Array.from(r.genome, x => x + (noise ? (rng() * 2 - 1) * noise : 0));
        const res = S.testDrive(T, g, r.nHid, 5);
        n++; if (res.laps >= 1) one++; if (res.finished) five++;
      }
      record({ pista: track, experimento, tipo: 'pesos', ruido: noise }, one, five, n);
    }
    for (const noise of SENSOR_NOISE) {
      let one = 0, five = 0, n = 0;
      runs.forEach((r, i) => {
        for (let k = 0; k < REPS; k++) {
          const res = S.testDrive(T, Float64Array.from(r.genome), r.nHid, 5, 0, false, { sensorNoise: noise, seed: 1000 * i + k + 1 });
          n++; if (res.laps >= 1) one++; if (res.finished) five++;
        }
      });
      record({ pista: track, experimento, tipo: 'sensores', ruido: noise }, one, five, n);
    }
  }
}
fs.writeFileSync(path.join(__dirname, 'resultados', 'robustez.json'), JSON.stringify(out, null, 1));
