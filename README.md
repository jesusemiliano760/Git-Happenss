# Git Happens — What Should Happen Next?

Agente de IA para el **Reto Byecode**: recibe eventos de propuestas comerciales
(aperturas, mensajes, acciones, restricciones, cierres) y recomienda la
**siguiente mejor accion — o inaccion —**, cuando hacerla, por que, con que
evidencia, con que confianza y con que riesgo.

> Idea central (lo que pidio el patrocinador en la presentacion): no es un
> recomendador que siempre empuja a actuar. Esperar o no hacer nada es una
> decision valida, y abrir una propuesta no demuestra intencion de compra.

## Como correrlo

Requisitos: Node 20+.

```bash
npm install
cp .env.example .env.local      # opcional: ANTHROPIC_API_KEY para usar Claude
npm run dev                     # http://localhost:3000
```

En la UI: **Cargar ejemplo** → revisa los casos → **+ Nuevos eventos de
ejemplo** (reevaluacion y "que cambio") → **Exportar JSON**. Tambien puedes
subir `events.jsonl` + `manifest.json` o pegar lineas JSONL.

Sin UI (genera el entregable JSON):

```bash
npm run decide                                   # usa data/kit/ si existe, si no data/sample/
npm run decide -- data/kit/events.jsonl data/kit/manifest.json output/decisions.json
npm test                                         # pruebas de reglas R1-R6, dedupe y errores
```

### Variables de entorno (sin secretos en el repo)

| Variable | Uso |
|---|---|
| `ANTHROPIC_API_KEY` | Activa el modo **live** (Claude interpreta los mensajes). Sin ella, modo **fallback** heuristico. |
| `ANTHROPIC_MODEL` | Opcional, default `claude-opus-5-5`. |
| `AGENT_MODE=fallback` | Fuerza el modo sin IA (pruebas reproducibles). |
| `HIGH_VALUE_MXN` | Umbral de monto para pedir revision humana (default 500000). |

## Como se usa la IA

- **La IA interpreta, las reglas deciden lo permitido.** Claude clasifica cada
  `message.received` con salida estructurada (JSON validado por esquema):
  intencion, objecion, fecha pedida para retomar, hechos vs inferencias,
  informacion faltante, confianza y si el texto parece una instruccion
  inyectada. El mensaje va delimitado y se trata como dato.
- Si no hay API key o la llamada falla, un clasificador heuristico en español
  produce la misma estructura (`source: "heuristic"`). La app nunca se cae.
- La politica (`lib/agent/policy.ts`) combina hechos + inferencias y propone
  la accion; el motor de reglas (`lib/rules/engine.ts`) audita R1-R6 y el
  contrato **antes de publicar**. Si algo falla, se sustituye por una
  alternativa segura (esperar / revision humana).

## Estructura

```
app/                 Next.js (UI + API)
  api/events         carga JSONL (archivo, formulario, endpoint) + reevalua
  api/evaluate       boton "Evaluar"
  api/cases[/id]     listado y detalle (historial, decision vigente y anterior, diff)
  api/export         decisiones en JSON (contrato seccion 6)
components/cases/    dashboard y traza del agente
lib/events/          contrato de entrada y validacion por linea
lib/store/           almacen en memoria con dedupe por event_id e historial de decisiones
lib/agent/           context (hechos + metricas), interpreter (IA), policy, agent (pipeline)
lib/rules/           R1-R6 + validacion del contrato
lib/decisions/       contrato de recomendacion
data/kit/            aqui va el kit oficial
data/sample/         datos de ejemplo del equipo (no oficiales)
scripts/run-kit.ts   CLI que genera output/decisions.json
tests/               pruebas de reglas
docs/                nota tecnica, demo, notas del audio, rescate de Banorte One
```

Ver `docs/NOTA_TECNICA.md` (entregable de 1 pagina), `docs/DEMO.md`,
`docs/NOTAS_AUDIO.md` y `docs/RESCATE_BANORTE.md`.
