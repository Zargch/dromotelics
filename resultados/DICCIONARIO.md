# Diccionario de datos

## `raw.jsonl` — una línea JSON por corrida (620 líneas)

Cada línea guarda su configuración completa, así que cualquier resultado se puede rastrear hasta la corrida que lo produjo. Los parámetros fijos (física, red, algoritmo, pistas) están en `config.json`.

**Configuración de la corrida**

| Campo | Significado |
| --- | --- |
| `exp` | Experimento: `main` (A), `mut` (B), `hid` (C), `random` (D), `laps2` (F) |
| `track` | Pista: `facil`, `media`, `dificil` |
| `pop` | Individuos por generación |
| `seed` | Semilla del generador aleatorio (`s × 7919 + sal`, con s = 1…20) |
| `mutRate` | Probabilidad de mutar cada peso |
| `nHid` | Neuronas ocultas |
| `laps` | Vueltas que evalúa la aptitud (1 o 2) |
| `gens` | Generaciones de la corrida |

**Series por generación** (un valor por generación, índice 0 = generación 1)

| Campo | Significado |
| --- | --- |
| `bp`, `ap`, `mp` | Progreso del mejor, promedio y mediano (fracción de vuelta, máximo 1) |
| `fin` | Autos que completan las vueltas evaluadas |
| `blt`, `alt` | Tiempo del mejor y tiempo promedio de los que terminan (s); `null` si nadie termina |
| `div` | Diversidad genética: desviación estándar media de los pesos |
| `muro`, `atasco`, `reversa`, `tiempo` | Autos eliminados por cada causa |

**Hitos** (generación en que ocurre por primera vez; `null` = no ocurrió)

| Campo | Significado |
| --- | --- |
| `firstLap` | Algún auto completa una vuelta |
| `half`, `all90` | El 50% / 90% de la población completa las vueltas evaluadas |
| `reliable` | El mejor genoma, probado solo, completa 5 vueltas seguidas |

**Otros**

| Campo | Significado |
| --- | --- |
| `champ` | Vueltas (0–5) del mejor genoma probado solo, cada 10 generaciones |
| `crashEarly`, `crashLate` | Choques contra el muro en 60 tramos de pista, antes y después de la primera vuelta |
| `snaps` | Trayectorias del mejor auto en generaciones seleccionadas (solo la semilla 1 con 50 autos) |
| `final` | Prueba de 5 vueltas del campeón final: vueltas, tiempos por vuelta, velocidad media, causa del fallo |
| `genome` | Pesos del campeón final, **redondeados a 4 decimales** |
| `ms` | Duración de la corrida en milisegundos |
| `found`, `curve`, `maxEvals` | Solo búsqueda aleatoria: evaluaciones hasta la primera vuelta, mejor progreso cada 50 evaluaciones, límite |

## Archivos derivados

| Archivo | Lo genera | Contenido |
| --- | --- | --- |
| `resumen.json` | `analisis.js` | Medianas, IC 95%, tasas, pruebas con corrección de Holm, transferencia |
| `curvas.csv` | `analisis.js` | Medianas por generación (pista × población) |
| `campeon.csv` | `analisis.js` | % de corridas cuyo campeón da 5 vueltas, cada 10 generaciones, y su media móvil |
| `evaluaciones.csv` | `analisis.js` | Mejor progreso según evaluaciones: evolución contra búsqueda aleatoria |
| `transferencia.csv` | `analisis.js` | Matriz de transferencia entre pistas |
| `figdata.json` | `analisis.js` | Datos de las figuras de `figuras.html` |
| `config.json` | `analisis.js` | Parámetros fijos, pistas, versión de Node y SHA-256 de `sim.js` |
| `robustez.json` | `robustez.js` | Campeones finales con ruido en pesos y sensores |
| `tablas.md` | `tablas.js` | Todas las tablas del artículo |
| `piloto.json`, `piloto.txt` | `experimento.js` | Estudio piloto |
