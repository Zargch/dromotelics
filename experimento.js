// Experimento sin gráficos: ¿cuántas generaciones tarda la IA en aprender a dar una vuelta?
// Uso: node experimento.js [semillas=30] [maxGen=300]
const fs = require('fs');
const S = require('./sim.js');

const SEEDS = +process.argv[2] || 30;
const MAX_GEN = +process.argv[3] || 300;
const POPS = [20, 50, 100];
const track = S.buildTrack(S.CONTROL, S.HALF_WIDTH, 10);

function stats(arr) {
  const ok = arr.filter(x => x != null).sort((a, b) => a - b);
  if (!ok.length) return { exito: `0/${arr.length}` };
  const q = p => ok[Math.min(ok.length - 1, Math.floor(p * (ok.length - 1) + 0.5))];
  return {
    exito: `${ok.length}/${arr.length}`,
    media: +(ok.reduce((s, x) => s + x, 0) / ok.length).toFixed(1),
    mediana: q(0.5), min: ok[0], p90: q(0.9), max: ok[ok.length - 1]
  };
}

console.log(`Pista: ${track.length.toFixed(0)} px, radio mínimo ${track.minR.toFixed(1)} px, medio ancho ${S.HALF_WIDTH}`);
const results = {};
const t0 = Date.now();
for (const pop of POPS) {
  const first = [], half = [], lap = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const ev = new S.Evolution({ track, seed: seed * 7919 + pop, pop, maxSteps: 60 * 45 }); // el piloto usó 45 s por generación
    let gFirst = null, gHalf = null, lapT = null;
    for (let g = 1; g <= MAX_GEN; g++) {
      const s = ev.runGen();
      if (gFirst == null && s.finishers > 0) gFirst = g;
      if (s.finishers >= pop / 2) { gHalf = g; lapT = s.bestLapTime; break; }
    }
    first.push(gFirst); half.push(gHalf); lap.push(lapT);
    process.stdout.write(`pop ${pop} semilla ${seed}: 1ª vuelta gen ${gFirst ?? '—'}, 50% gen ${gHalf ?? '—'}\n`);
  }
  results[pop] = { primeraVuelta: stats(first), mitadPoblacion: stats(half), tiempoVuelta: stats(lap.map(x => x && +x.toFixed(1))), raw: { first, half } };
}
console.log(`\nTiempo total: ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
for (const pop of POPS) {
  console.log(`== Población ${pop} ==`);
  console.log('  Primera vuelta completa :', JSON.stringify(results[pop].primeraVuelta));
  console.log('  50% de autos completan  :', JSON.stringify(results[pop].mitadPoblacion));
  console.log('  Mejor tiempo de vuelta s:', JSON.stringify(results[pop].tiempoVuelta));
}
fs.writeFileSync(__dirname + '/resultados/piloto.json', JSON.stringify(results, null, 2));
