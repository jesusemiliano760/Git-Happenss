# Que se rescato de `aamagamer/banorte` (Banorte One)

| De Banorte One | Aqui | Como se reutilizo |
|---|---|---|
| Stack Next.js 16 + React 19 + Tailwind 4 + shadcn (`package.json`, `tsconfig.json`, `postcss.config.mjs`, `components.json`) | raiz | Copiado tal cual (sin Supabase ni analytics). |
| `lib/utils.ts`, `components/ui/button.tsx` | mismas rutas | Copiados. |
| Patron **LIVE / FALLBACK** de `lib/agent/llm-orchestrator.ts` (Claude si hay key, motor determinista si no; "que no falle") | `lib/agent/interpreter.ts` | Misma idea: Claude con salida estructurada y clasificador heuristico de respaldo. |
| **Validar la salida de la IA contra un catalogo cerrado** (`validateUISchema`) | `lib/rules/engine.ts` | Ahora valida acciones/timing/contrato y reglas R1-R6 antes de publicar. |
| **Aislamiento**: el `customerId` nunca lo decide el modelo | interpreter + rules | El mensaje del cliente es dato; no puede cambiar restricciones. |
| Panel **"MCP Activity"** (log de cada tool call para el jurado) | `components/cases/trace-panel.tsx` | Ahora "Traza del agente": contexto, interpretaciones, acciones permitidas, propuesta, validacion. |
| `fallbackUISchema()` ante fallos | `safeFallback()` en `lib/agent/policy.ts` | Alternativa segura si una regla rechaza la propuesta. |
| Interfaz de repositorio (`SavedViewsRepository`) | `lib/store/memory-store.ts` | Almacen intercambiable (memoria hoy, BD despues). |
| Carpeta `context/` (perfiles, situaciones, reglas en JSON) | idea para `docs/NOTAS_AUDIO.md` | Base para perfiles de cliente como siguiente paso. |
| Tokens de estilo (`globals.css`), tarjetas de alerta/recomendacion | `app/globals.css` | Misma estructura de tokens, paleta neutral. |
| Estructura de docs (ARCHITECTURE, DEMO, SECURITY) | `docs/` | Misma organizacion. |

No se reutilizo: datos bancarios demo, Banxico/Frankfurter, login y tablas de
Supabase, componentes financieros (graficas, cuentas, tarjetas).
