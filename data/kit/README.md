# Kit oficial del reto

Archivos del kit de participantes, copiados sin modificar:

| Archivo | Uso |
|---|---|
| `events.jsonl` | Eventos iniciales (6 casos, P01-P06, con un duplicado en P02) |
| `updates.jsonl` | Evento nuevo de P06 para demostrar reevaluacion |
| `manifest.json` | `evaluation_at` = hora "actual" de la evaluacion |
| `contratos.json` | Contrato de eventos y de recomendacion |
| `politicas.txt` | Reglas R1-R6 |
| `ejemplo_salida.json` | Formato de salida esperado (caso P03) |
| `README_KIT.txt` | Instrucciones del kit |

`npm run decide` usa esta carpeta, aplica `updates.jsonl` y escribe
`output/decisions-inicial.json` (antes) y `output/decisions.json` (final).

No subas aqui archivos reservados del jurado.
