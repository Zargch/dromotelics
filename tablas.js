// Genera resultados/tablas.md con todas las tablas del artículo a partir de resumen.json y robustez.json.
// Uso: node tablas.js (después de analisis.js y robustez.js)
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'resultados');
const R = JSON.parse(fs.readFileSync(path.join(dir, 'resumen.json'), 'utf8'));
const rob = fs.existsSync(path.join(dir, 'robustez.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'robustez.json'), 'utf8')) : [];
const NAMES = { facil: 'Fácil', media: 'Media', dificil: 'Difícil' };
const n = x => x == null ? '—' : String(x).replace('.', ',');
const pct = x => x == null ? '—' : `${Math.round(x * 100)}%`;
const ic = a => a ? `[${n(a[0])}; ${n(a[1])}]` : '—';
const icp = a => a ? `[${pct(a[0])}; ${pct(a[1])}]` : '—';
const med = m => m.mediana == null ? `>${m.ic95[1].toString().replace('>', '')}` : n(m.mediana);
const table = (head, rows) => `| ${head.join(' | ')} |\n| ${head.map(() => '---').join(' | ')} |\n${rows.map(r => `| ${r.join(' | ')} |`).join('\n')}\n`;
let md = `# Tablas del estudio Dromotelics\n\nGenerado automáticamente por \`tablas.js\` desde \`resumen.json\` (${R.generado}). Medianas con IC 95% bootstrap (2000 remuestreos); proporciones con IC 95% de Wilson. Las corridas que no alcanzan el hito cuentan como fallos (+∞).\n\n`;

md += `## A. Generaciones hasta la primera vuelta y piloto confiable\n\n` + table(
  ['Pista', 'Autos', 'Éxito (IC 95%)', '1ª vuelta: mediana (IC 95%)', 'Rango intercuartílico', 'Evaluaciones: mediana (IC 95%)', 'Piloto confiable: mediana (IC 95%)', '50% termina: mediana'],
  Object.values(R.principal).map(p => [NAMES[p.pista], p.pop, `${pct(p.primeraVuelta.tasa)} ${icp(p.primeraVuelta.tasa_ic95)}`, `${med(p.primeraVuelta)} ${ic(p.primeraVuelta.ic95)}`, `${n(p.primeraVuelta.p25)}–${n(p.primeraVuelta.p75)}`, `${med(p.primeraVueltaEvals)} ${ic(p.primeraVueltaEvals.ic95)}`, `${med(p.confiable)} ${ic(p.confiable.ic95)}`, `${med(p.mitad)} (${pct(p.mitad.tasa)} lo logra)`])
) + '\n';

md += `## B. Tasa de mutación (50 autos, 300 generaciones)\n\n` + table(
  ['Pista', 'Mutación', '1ª vuelta: mediana (IC 95%)', '50% termina: mediana (IC 95%)', '50% termina: éxito (IC 95%)'],
  Object.values(R.mutacion).map(m => [NAMES[m.pista], n(m.mutacion), `${med(m.primeraVuelta)} ${ic(m.primeraVuelta.ic95)}`, `${med(m.mitad)} ${ic(m.mitad.ic95)}`, `${pct(m.mitad.tasa)} ${icp(m.mitad.tasa_ic95)}`])
) + '\n';

md += `## C. Tamaño de la red (50 autos, 300 generaciones)\n\n` + table(
  ['Pista', 'Ocultas', 'Pesos', '1ª vuelta: mediana (IC 95%)', '50% termina: mediana (IC 95%)', '50% termina: éxito (IC 95%)'],
  Object.values(R.red).map(m => [NAMES[m.pista], m.ocultas, m.pesos, `${med(m.primeraVuelta)} ${ic(m.primeraVuelta.ic95)}`, `${med(m.mitad)} ${ic(m.mitad.ic95)}`, `${pct(m.mitad.tasa)} ${icp(m.mitad.tasa_ic95)}`])
) + '\n';

md += `## D. Búsqueda aleatoria (hasta 50 000 evaluaciones)\n\n` + table(
  ['Pista', 'Éxito (IC 95%)', 'Evaluaciones: mediana (IC 95%)'],
  Object.entries(R.aleatoria).map(([k, a]) => [NAMES[k], `${pct(a.evaluaciones.tasa)} ${icp(a.evaluaciones.tasa_ic95)}`, `${med(a.evaluaciones)} ${ic(a.evaluaciones.ic95)}`])
) + '\n';

md += `## E. Transferencia (campeones finales, 50 autos, 5 vueltas)\n\n` + table(
  ['Entrenado en', 'Probado en', '≥ 1 vuelta', '5 vueltas', 'Progreso mediano (vueltas)'],
  R.transferencia.map(t => [NAMES[t.entrenada], NAMES[t.probada], pct(t.vuelta1), pct(t.cinco), n(t.progresoMediano)])
) + '\n';

md += `## F. Aptitud de 1 vuelta contra 2 vueltas (mismas semillas, 50 autos)\n\n` + table(
  ['Pista', 'Campeones finales con 5 vueltas: 1 vuelta (IC 95%)', '2 vueltas (IC 95%)', '1ª vuelta: mediana con 2 vueltas'],
  Object.entries(R.dosVueltas).map(([k, d]) => [NAMES[k], `${d.final5vueltas_1vuelta}/20 ${icp(d.final5vueltas_1vuelta_ic95)}`, `${d.final5vueltas}/${d.corridas} ${icp(d.final5vueltas_ic95)}`, med(d.primeraVuelta)])
) + '\n';

if (rob.length) md += `## Robustez de los campeones finales\n\nRuido en los pesos: uniforme ±x. Ruido en los sensores: gaussiano de desviación σ sobre cada rayo normalizado (0–1). Porcentaje de pruebas que completan al menos 1 vuelta (IC 95%).\n\n` + table(
  ['Pista', 'Aptitud', 'Tipo', 'Ruido', 'Pruebas', '≥ 1 vuelta (IC 95%)', '5 vueltas (IC 95%)'],
  rob.map(r => [NAMES[r.pista], r.experimento, r.tipo, n(r.ruido), r.pruebas, `${pct(r.unaVuelta)} ${icp(r.unaVuelta_ic95)}`, `${pct(r.cincoVueltas)} ${icp(r.cincoVueltas_ic95)}`])
) + '\n';

md += `## Pruebas de Mann-Whitney (${R.pruebasCorreccion.familia} pruebas, corrección de ${R.pruebasCorreccion.metodo})\n\nA = A de Vargha-Delaney: probabilidad de que un valor del primer grupo supere al del segundo (0,5 = sin diferencia; 0,71 o 0,29 se consideran efectos grandes). Valores mayores significan peor (más generaciones o evaluaciones), salvo en "vueltas del campeón final".\n\n` + table(
  ['Comparación', 'z', 'p', 'p (Holm)', 'A', 'Significativa tras Holm'],
  Object.entries(R.pruebas).map(([k, t]) => [k, n(t.z), n(t.p), n(t.pHolm), n(t.efecto), t.significativaHolm ? 'sí' : 'no'])
);

fs.writeFileSync(path.join(dir, 'tablas.md'), md);
console.log(`resultados/tablas.md (${md.length} caracteres)`);
