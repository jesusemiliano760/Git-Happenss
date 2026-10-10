# Git Happens — What Should Happen Next?

Agente de IA para el **Reto Byecode**: recibe eventos de propuestas comerciales
(aperturas, mensajes, acciones, restricciones, cierres) y recomienda la
**siguiente mejor acción — o inacción —**, cuándo hacerla, por qué, con qué
evidencia, con qué confianza y con qué riesgo.

> No es un
> recomendador que siempre empuja a actuar. Esperar o no hacer nada es una
> decisión válida, y abrir una propuesta no demuestra intención de compra.

## Cómo correrlo

Requisitos: Node 20+.

```bash
npm install
cp .env.example .env.local      # luego llena tus llaves en .env.local
npm run check:ia                # debe terminar en "OK"
npm run dev                     # http://localhost:3000
```

**En Windows (PowerShell)** usa `npm.cmd` en lugar de `npm` (por ejemplo
`npm.cmd install`, `npm.cmd run dev`) y `copy` en lugar de `cp`. Copia
`.env.example` solo la primera vez: si `.env.local` ya existe, la copia borra
tus llaves. Para la demo conviene `npm.cmd run build` y luego `npm.cmd start`.

En la UI: **Cargar kit oficial** → revisa los casos → **+ updates.jsonl**
(P06 cambia: reevaluación y "qué cambió") → **Exportar JSON**. También puedes
subir `events.jsonl` + `manifest.json` o pegar líneas JSONL. "Ejemplo extra"
carga casos inventados por el equipo (instrucciones inyectadas, montos altos,
enfriamiento R4, etc.).

Sin UI:

```bash
npm run decide        # kit oficial + updates -> output/decisions-inicial.json y output/decisions.json
npm run decide -- <events.jsonl> <manifest.json> <salida.json> [updates.jsonl ...]
npm test              # reglas R1-R6, dedupe, errores y regresion contra el kit oficial
```

### Base de datos Supabase

1. En Supabase: **SQL Editor → New query**, pega `supabase/schema.sql` y **Run**.
2. En `.env.local` pon `SUPABASE_URL` y `SUPABASE_SECRET_KEY` (llave secreta /
   service_role, solo servidor). `SUPABASE_URL` es la URL base del proyecto,
   **sin `/rest/v1`** al final (`https://<proyecto>.supabase.co`); si la
   copias de "Data API" con `/rest/v1`, borra esa parte.
3. `npm run check:db` → debe decir `OK` y listar las 5 tablas.

El agente trabaja en memoria y **además** guarda en Supabase eventos,
interpretaciones de la IA, decisiones (historial completo) y errores de
formato; al reiniciar la app los vuelve a cargar. El botón **Reiniciar** guarda
primero una copia de todo en `app_state` (llave `historial:<fecha>`, no se
borra), limpia el resto y vuelve a cargar el kit oficial. Si Supabase falla, la app
sigue en memoria y la barra superior muestra `BD: supabase (error)`.

| Tabla | Contenido |
|---|---|
| `events` | Eventos del JSONL; `event_id` es llave primaria (dedupe en la BD) |
| `interpretations` | Lo que dijo la IA de cada mensaje (cache) |
| `decisions` | Cada evaluación; la última por caso es la vigente (vista `current_decisions`) |
| `ingest_errors` | Lineas con error de formato |
| `app_state` | `evaluation_at` del manifest, y una copia completa (`historial:<fecha>`) cada vez que se presiona **Reiniciar** |

### Publicar en Vercel

GitHub Pages no sirve (el agente necesita servidor). Con Vercel:

1. vercel.com → **Continue with GitHub** → **Add New → Project** → importar
   este repo (lo hace la cuenta dueña del repo o quien tenga la app de Vercel
   instalada en el).
2. En **Environment Variables** agregar las mismas de `.env.local`
   (`GEMINI_API_KEY`, `GEMINI_MODEL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`).
3. **Deploy**. Cada cambio en `main` se vuelve a publicar solo.

Notas: en Vercel conviene tener Supabase configurado, porque el servidor
corre en varias copias y cada petición lee el estado desde la BD; sin
Supabase cada copia tiene su propia memoria. Los archivos de `data/` se
incluyen en el build via `outputFileTracingIncludes` (`next.config.mjs`).

### Variables de entorno (sin secretos en el repo)

| Variable | Uso |
|---|---|
| `GEMINI_API_KEY` | Activa el modo **live**: Gemini interpreta los mensajes. Sin ella, modo **fallback** heurístico. |
| `GEMINI_MODEL` | Opcional, default `gemini-3.8-flash`. |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Alternativa: Claude, solo si no hay llave de Gemini. |
| `SUPABASE_URL` / `SUPABASE_SECRET_KEY` | Activan la persistencia en Supabase (opcional). La URL va sin `/rest/v1`. |
| `LLM_TIMEOUT_SECONDS` | Límite por llamada a la IA (default 20); si se pasa, se usa la heurística. |
| `AGENT_MODE=fallback` | Fuerza el modo sin IA (pruebas reproducibles). |
| `HIGH_VALUE_MXN` | Umbral de monto para pedir revisión humana (default 500000). |

## Cómo se usa la IA

- **La IA interpreta, las reglas deciden lo permitido.** Gemini (`@google/genai`,
  `generateContent` con `responseJsonSchema`) clasifica cada
  `message.received` con salida estructurada (JSON validado por esquema):
  intención, objeción, fecha pedida para retomar, hechos vs inferencias,
  información faltante, confianza y si el texto parece una instrucción
  inyectada. El mensaje va delimitado y se trata como dato. La respuesta se
  valida otra vez con Zod y se guarda por `event_id` (no se paga dos veces el
  mismo mensaje).
- Si no hay API key o la llamada falla, un clasificador heurístico en español
  produce la misma estructura (`source: "heuristic"`). La app nunca se cae.
- La política (`lib/agent/policy.ts`) combina hechos + inferencias y propone
  la acción; el motor de reglas (`lib/rules/engine.ts`) audita R1-R6 y el
  contrato **antes de publicar**. Si algo falla, se sustituye por una
  alternativa segura (esperar / revisión humana).

## Resultado sobre el kit oficial (`output/decisions.json`)

| Caso | Situación | Recomendación |
|---|---|---|
| P01 | Pregunta si incluye instalación | `resolve_objection` inmediato |
| P02 | Una apertura de la sección de precio (duplicado ignorado) | `wait` 24h: una apertura no confirma intención (R5) |
| P03 | Pide no ser contactado antes del 12-oct 15:00 + restricción | `wait` `at_date` 2026-10-12T15:00Z (igual a `ejemplo_salida.json`) |
| P04 | "Me interesa" pero `contact_allowed=false` | `escalate` a revisión humana, sin contactar (R2) |
| P05 | Caso cerrado (accepted) | `no_action` (R1) |
| P06 | Contacto hace 2h → con `updates.jsonl` llega una pregunta | `wait` (R4) → `resolve_objection` |

## Estructura

```
app/                 Next.js (UI + API)
  api/events         carga JSONL (archivo, formulario, endpoint) + reevalúa
  api/evaluate       botón "Evaluar"
  api/cases[/id]     listado y detalle (historial, decisión vigente y anterior, diff)
  api/export         decisiones en JSON (contrato sección 6)
components/cases/    dashboard y traza del agente
lib/events/          contrato de entrada y validación por línea
lib/store/           almacén en memoria (dedupe, historial) + sincronización con Supabase
supabase/schema.sql  tablas para Supabase
lib/agent/           context (hechos + métricas), interpreter (IA), policy, agent (pipeline)
lib/rules/           R1-R6 + validación del contrato
lib/decisions/       contrato de recomendación
data/kit/            kit oficial de participantes (sin modificar)
data/sample/         datos de ejemplo del equipo (no oficiales)
scripts/run-kit.ts   CLI que genera output/decisions.json
tests/               pruebas de reglas
docs/                nota tecnica, demo, notas del audio, rescate de Banorte One
```

Ver `docs/NOTA_TECNICA.md` (entregable de 1 página), `docs/DEMO.md`,
y `docs/NOTAS_AUDIO.md`.
