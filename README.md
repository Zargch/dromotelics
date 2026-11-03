# Proyecto Dromotelics

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23901487.svg)](https://doi.org/10.5281/zenodo.23901487)

**¿Cuántas generaciones necesita una IA para aprender a conducir?** Estudio experimental de neuroevolución aplicado a vehículos simulados en circuitos 2D de distinta dificultad.

**[▶ Probar el simulador en el navegador](https://zargch.github.io/dromotelics/)** · [Figuras](https://zargch.github.io/dromotelics/figuras.html) · [Artículo (PDF)](articulo/Dromotelics.pdf) · [Tablas](resultados/tablas.md) · [Datos](resultados/)

Cada auto es una red neuronal de 112 pesos que ve la pista con 7 sensores de distancia. Un algoritmo genético la mejora generación tras generación, sin ejemplos ni gradientes. Medimos cuántas generaciones tarda en completar la primera vuelta y en conducir de forma confiable, con 20 semillas por configuración, en 3 pistas, con 3 tamaños de población y hasta 1000 generaciones: 620 corridas en total.

> **Alcance.** Es un simulador 2D con física cinemática simplificada y sensores ideales. "Conducir" significa recorrer un circuito simulado sin tocar sus paredes. Los resultados no demuestran conducción autónoma real.

## Resultados principales

Con 50 autos por generación (mediana de 20 corridas e intervalo de confianza del 95%):

| Pista | Primera vuelta (generaciones) | Piloto confiable (5 vueltas seguidas) | Corridas que lo logran |
| --- | --- | --- | --- |
| Fácil (óvalo ancho) | 1 (1–2) | 1 (1–2) | 100% (84–100%) |
| Media (horquillas, curvas en S) | 16 (12,5–21) | 16 (12,5–24,5) | 95% (76–99%) |
| Difícil (estrecha, 4 horquillas en U) | 31 (25–46) | 31 (24–51) | 100% (84–100%) |

- **La pista decide.** La diferencia entre pistas es significativa y grande; la de la población sobre las generaciones es solo una tendencia (Mann-Whitney con corrección de Holm sobre 29 pruebas).
- **La evolución no es suerte.** Necesita unas 14 veces menos evaluaciones que probar redes al azar en la pista media; en la difícil, el azar falla en 15 de 20 corridas.
- **La red puede ser diminuta.** Con 3 neuronas ocultas (35 pesos) ya alcanza; con 40 neuronas la población entera aprende más lento (significativo en la pista difícil).
- **Rápido no es robusto.** Seguir evolucionando hace a los campeones más rápidos y más frágiles: en la pista difícil, los que completan 5 vueltas seguidas caen del 75% (generación 100) al 10% (generación 1000). Pasan a centésimas de píxel del muro, y un error de unos 4 px en los sensores basta para que la mayoría choque. Evaluar 2 vueltas (experimento F) triplica los campeones confiables en las pistas fácil y difícil, pero no elimina el problema.
- **Transferencia asimétrica.** Lo aprendido en una pista difícil sirve en una fácil, pero no al revés.

## Cómo usarlo

Validado con Node.js 26.8.1 en Windows 11. El código usa funciones disponibles desde Node.js 18, pero esas versiones no se probaron. No tiene dependencias: no hace falta `npm install`.

```bash
npm run servidor     # simulador en http://localhost:8080 y figuras en /figuras.html
npm run estudio      # experimentos A a D (unos 55 min en 16 hilos)
npm run estudio:f    # experimento F: la aptitud evalúa 2 vueltas (unos 25 min)
npm run resultados   # análisis + robustez + tablas → resultados/
npm run prueba       # versión reducida de todo el estudio (unos minutos)
```

Cada corrida usa una semilla fija y se reproduce exactamente. Si `estudio.js` se interrumpe, al volver a ejecutarlo salta las corridas ya guardadas. Cada línea de `raw.jsonl` guarda su configuración completa; los parámetros fijos y la huella SHA-256 del simulador están en `resultados/config.json`.

## Estructura

| Parte | Archivos |
| --- | --- |
| Simulación | `sim.js` (pistas, física, sensores, red neuronal, algoritmo genético; Node y navegador) |
| Experimentación | `estudio.js` (A–F en paralelo), `experimento.js` (piloto) |
| Análisis | `analisis.js` (medianas, IC, Mann-Whitney, Holm), `robustez.js` (ruido en pesos y sensores), `tablas.js` (tablas del artículo) |
| Visualización | `index.html` (simulador), `figuras.html` (figuras), `servidor.js` (servidor local) |
| Resultados | `resultados/raw.jsonl` (datos crudos), derivados y `DICCIONARIO.md` |
| Figuras | `figuras/` (PNG de alta resolución y capturas) |
| Documentación | `articulo/Dromotelics.pdf`, `CHANGELOG.md`, `CITATION.cff` |

La estructura es plana a propósito: GitHub Pages sirve `index.html` y `sim.js` desde la raíz sin paso de compilación.

## Limitaciones

- Física cinemática sin derrape ni inercia lateral; sensores exactos, sin ruido ni retardo; una sola posición de salida.
- Tres pistas: no alcanzan para separar qué rasgo geométrico causa la dificultad.
- Una sola configuración del algoritmo genético; no se comparó con NEAT ni con aprendizaje por refuerzo.
- 20 semillas por grupo: solo se detectan con seguridad efectos grandes.
- Los pesos de los campeones se guardaron con 4 decimales y solo los finales; la robustez de los campeones intermedios no se midió.

## Cómo citar

Zarate, C. (2026). *Dromotelics: ¿cuántas generaciones necesita una IA para aprender a conducir? Estudio de neuroevolución en circuitos 2D* (versión 1.1.0) [Software]. Zenodo. https://doi.org/10.5281/zenodo.23901488

Para citar siempre la versión más reciente, usa el DOI del concepto: [10.5281/zenodo.23901487](https://doi.org/10.5281/zenodo.23901487). Ver también [`CITATION.cff`](CITATION.cff). Historial de cambios en [`CHANGELOG.md`](CHANGELOG.md).

## Licencia

MIT © 2026 Carlos Zarate (Zargch). Todo el código, los datos y las figuras se generaron dentro de este proyecto; no incluye recursos de terceros. Ver [LICENSE](LICENSE).

---

*English summary: Dromotelics is an experimental neuroevolution study in a simplified 2D simulator. It measures how many generations a simple genetic algorithm needs to evolve a 112-weight neural network that drives a simulated car around a track. With 50 individuals, the median is 1, 16 and 31 generations on easy, medium and hard tracks (20 seeds each, 620 runs in total). Longer evolution makes champions faster but fragile: they pass within hundredths of a pixel of the wall. Code, raw data, statistics and an in-browser simulator are included.*
