# Cambios

## 1.1.0 — 2026-11-02 · Auditoría científica

Ningún dato experimental cambió: `resultados/raw.jsonl` es idéntico al de la versión 1.0.0 (MD5 `3dbdd502fb2f4700344c14c19902431a`) y todas las medianas, tasas y pruebas previas se reproducen igual.

**Estadística**
- Intervalos de confianza de Wilson al 95% para todas las proporciones (`analisis.js`).
- Corrección de Holm-Bonferroni sobre las 29 pruebas de Mann-Whitney del estudio y tamaño del efecto con nombre (A de Vargha-Delaney).
- Pruebas nuevas para los experimentos B (mutación) y C (tamaño de la red), que antes solo se describían como tendencias.
- Los valores p muy pequeños ya no se redondean a 0 (`<0.001`, `<0.0001`).
- La curva suavizada de confiabilidad (media móvil de 50 generaciones) ahora la calcula `analisis.js` en `campeon.csv`; antes se calculaba a mano.

**Errores corregidos**
- `analisis.js`, función `q` (percentiles): con dos valores centrales de fallo (+∞), la interpolación calculaba ∞ − ∞ = NaN y desordenaba el bootstrap. Afectaba solo a 8 intervalos de confianza de configuraciones con muchos fallos (por ejemplo, mutación 0,4 en la pista media mostraba `[—; 81]`, ahora `[67; >300]`). Las medianas, cuartiles y pruebas no cambian, y la versión 1.0.0 del artículo no publicaba esos intervalos.
- `analisis.js` asumía 1000 generaciones fijas; ahora lo toma de los datos, así la prueba reducida (`npm run prueba`) también se puede analizar.

**Robustez**
- `sim.js`: `testDrive` acepta un parámetro opcional `{ sensorNoise, seed, onStep }`. Sin él, la simulación es idéntica bit a bit (verificado reproduciendo corridas guardadas).
- `robustez.js`: nueva prueba con ruido gaussiano en los sensores (σ = 0,02, 0,05 y 0,1), además del ruido en los pesos, con IC de Wilson.

**Reproducibilidad**
- `resultados/config.json`: parámetros físicos, de la red y del algoritmo, puntos de control de las pistas, versión de Node y SHA-256 de `sim.js`.
- `tablas.js` genera `resultados/tablas.md` con todas las tablas del artículo desde los datos.
- `package.json` con la versión de Node y comandos; `CITATION.cff`; diccionario de datos en `resultados/DICCIONARIO.md`.
- `experimento.js` fija el límite de 45 s por generación del piloto original y escribe en `resultados/piloto.json`.
- `figuras.html` oculta el botón de exportar fuera de `localhost`.

**Artículo**
- Correcciones verificadas contra los datos (ver la sección de auditoría del artículo).

## 1.0.0 — 2026-11-02 · Estudio original

Simulador, 3 pistas, experimentos A–F (620 corridas), análisis, figuras y artículo.
