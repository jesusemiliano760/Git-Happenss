# Git Happens — What Should Happen Next?

Agente de IA para el **Reto Byecode**: recibe eventos de propuestas comerciales
(aperturas, mensajes, acciones, restricciones, cierres) y recomienda la
**siguiente mejor accion — o inaccion —**, cuando hacerla, por que, con que
evidencia, con que confianza y con que riesgo.

>No es un
> recomendador que siempre empuja a actuar. Esperar o no hacer nada es una
> decision valida, y abrir una propuesta no demuestra intencion de compra.

## Como correrlo

Requisitos: Node 20+.

```bash
npm install
cp .env.example .env.local      # pon tu GEMINI_API_KEY ahi
npm run check:ia                # verifica que la llave de Gemini funcione
npm run dev                     # http://localhost:3000
```

En la UI: **Cargar kit oficial** → revisa los casos → **+ updates.jsonl**
(P06 cambia: reevaluacion y "que cambio") → **Exportar JSON**. Tambien puedes
subir `events.jsonl` + `manifest.json` o pegar lineas JSONL. "Ejemplo extra"
carga casos inventados por el equipo (instrucciones inyectadas, montos altos,
enfriamiento R4, etc.).

Sin UI (genera el entregable JSON):

```bash
npm run decide        # kit oficial + updates -> output/decisions-inicial.json y output/decisions.json
npm run decide -- <events.jsonl> <manifest.json> <salida.json> [updates.jsonl ...]
npm test              # reglas R1-R6, dedupe, errores y regresion contra el kit oficial
```

### Base de datos (Supabase, opcional)

1. En Supabase: **SQL Editor → New query**, pega `supabase/schema.sql` y **Run**.
2. En `.env.local` pon `SUPABASE_URL` y `SUPABASE_SECRET_KEY` (llave secreta /
   service_role, solo servidor).
3. `npm run check:db` → debe decir `OK` y listar las 5 tablas.

El agente trabaja en memoria y **ademas** guarda en Supabase eventos,
interpretaciones de la IA, decisiones (historial completo) y errores de
formato; al reiniciar la app los vuelve a cargar. Si Supabase falla, la app
sigue en memoria y la barra superior muestra `BD: supabase (error)`.

| Tabla | Contenido |
|---|---|
| `events` | Eventos del JSONL; `event_id` es llave primaria (dedupe en la BD) |
| `interpretations` | Lo que dijo la IA de cada mensaje (cache) |
| `decisions` | Cada evaluacion; la ultima por caso es la vigente (vista `current_decisions`) |
| `ingest_errors` | Lineas con error de formato |
| `app_state` | `evaluation_at` del manifest |

### Variables de entorno (sin secretos en el repo)

| Variable | Uso |
|---|---|
| `GEMINI_API_KEY` | Activa el modo **live**: Gemini interpreta los mensajes. Sin ella, modo **fallback** heuristico. |
| `GEMINI_MODEL` | Opcional, default `gemini-2.5-flash`. |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Alternativa: Claude, solo si no hay llave de Gemini. |
| `SUPABASE_URL` / `SUPABASE_SECRET_KEY` | Activan la persistencia en Supabase (opcional). |
| `AGENT_MODE=fallback` | Fuerza el modo sin IA (pruebas reproducibles). |
| `HIGH_VALUE_MXN` | Umbral de monto para pedir revision humana (default 500000). |

## Como se usa la IA

- **La IA interpreta, las reglas deciden lo permitido.** Gemini (`@google/genai`,
  `generateContent` con `responseJsonSchema`) clasifica cada
  `message.received` con salida estructurada (JSON validado por esquema):
  intencion, objecion, fecha pedida para retomar, hechos vs inferencias,
  informacion faltante, confianza y si el texto parece una instruccion
  inyectada. El mensaje va delimitado y se trata como dato. La respuesta se
  valida otra vez con Zod y se guarda por `event_id` (no se paga dos veces el
  mismo mensaje).
- Si no hay API key o la llamada falla, un clasificador heuristico en español
  produce la misma estructura (`source: "heuristic"`). La app nunca se cae.
- La politica (`lib/agent/policy.ts`) combina hechos + inferencias y propone
  la accion; el motor de reglas (`lib/rules/engine.ts`) audita R1-R6 y el
  contrato **antes de publicar**. Si algo falla, se sustituye por una
  alternativa segura (esperar / revision humana).

## Resultado sobre el kit oficial (`output/decisions.json`)

| Caso | Situacion | Recomendacion |
|---|---|---|
| P01 | Pregunta si incluye instalacion | `resolve_objection` inmediato |
| P02 | Una apertura de la seccion de precio (duplicado ignorado) | `wait` 24h: una apertura no confirma intencion (R5) |
| P03 | Pide no ser contactado antes del 12-oct 15:00 + restriccion | `wait` `at_date` 2026-10-12T15:00Z (igual a `ejemplo_salida.json`) |
| P04 | "Me interesa" pero `contact_allowed=false` | `escalate` a revision humana, sin contactar (R2) |
| P05 | Caso cerrado (accepted) | `no_action` (R1) |
| P06 | Contacto hace 2h → con `updates.jsonl` llega una pregunta | `wait` (R4) → `resolve_objection` |

## Estructura

```
app/                 Next.js (UI + API)
  api/events         carga JSONL (archivo, formulario, endpoint) + reevalua
  api/evaluate       boton "Evaluar"
  api/cases[/id]     listado y detalle (historial, decision vigente y anterior, diff)
  api/export         decisiones en JSON (contrato seccion 6)
components/cases/    dashboard y traza del agente
lib/events/          contrato de entrada y validacion por linea
lib/store/           almacen en memoria (dedupe, historial) + sincronizacion con Supabase
supabase/schema.sql  tablas para Supabase
lib/agent/           context (hechos + metricas), interpreter (IA), policy, agent (pipeline)
lib/rules/           R1-R6 + validacion del contrato
lib/decisions/       contrato de recomendacion
data/kit/            kit oficial de participantes (sin modificar)
data/sample/         datos de ejemplo del equipo (no oficiales)
scripts/run-kit.ts   CLI que genera output/decisions.json
tests/               pruebas de reglas
docs/                nota tecnica, demo, notas del audio, rescate de Banorte One
```

Ver `docs/NOTA_TECNICA.md` (entregable de 1 pagina), `docs/DEMO.md`,
y `docs/NOTAS_AUDIO.md`.
