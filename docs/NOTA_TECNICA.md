# Nota tecnica (1 pagina)

**Flujo de datos.** `events.jsonl` → validacion por linea (`lib/events/parse.ts`;
un error no detiene a los demas casos) → almacen en memoria agrupado por
`case_id`, dedupe global por `event_id` (`lib/store/memory-store.ts`) →
por caso: `buildContext` → interpretacion IA de mensajes → `allowedActions`
(R1-R4) → `decide` (politica) → `validateRecommendation` (R1-R6 + contrato) →
publicacion. Cada evaluacion se guarda; la anterior se conserva para mostrar
el diff. La hora "actual" es `manifest.evaluation_time` (nunca el reloj real),
y los eventos posteriores a esa hora se ignoran.

**IA utilizada.** Claude (`claude-opus-5-5` por defecto, configurable) via
`@anthropic-ai/sdk` con salida estructurada (esquema Zod). Solo interpreta
`message.received`: intencion (`interested`, `objection`,
`requests_information`, `provides_information`, `requests_wait`,
`not_interested`, `ambiguous`), tema de objecion, fecha pedida para retomar,
solicitud de no contacto, sospecha de instruccion inyectada, hechos,
inferencias, faltantes y confianza. Respaldo sin red: clasificador heuristico
en español con la misma salida. Las interpretaciones se cachean por
`event_id`.

**Contexto.** Hechos observados (estado, monto, restricciones vigentes,
ultimo contacto, mensajes posteriores al contacto) y metricas entre acciones
(aperturas, minutos a la primera apertura, aperturas en 24h, horas a la
primera respuesta, horas desde el ultimo contacto). Se separan explicitamente
hechos (`facts`), inferencias (`inferences`) e informacion faltante.

**Reglas.** R1 cerrado → solo `no_action`. R2 `contact_allowed=false` y R3
antes de `contact_not_before` bloquean `contact`, `request_information` y
`resolve_objection`. R4 enfriamiento de 24h tras `contact`/`request_information`
salvo mensaje nuevo. R5 se valida sobre el texto de la recomendacion y prohibe
urgencia con confianza alta basada solo en aperturas. R6 exige declarar
faltantes. Se valida tambien el contrato (timing por accion, `scheduled_for`,
evidencia del mismo caso). Una infraccion dura reemplaza la propuesta por una
alternativa segura. Los mensajes del cliente nunca modifican restricciones.

**Confianza y riesgo.** Confianza `high` cuando la decision la determina un
hecho o una regla (cierre, restriccion, enfriamiento); la del interprete
cuando depende de un mensaje; `low` cuando solo hay aperturas o el mensaje es
ambiguo. Riesgo = costo de equivocarse al intervenir o al esperar: alto si el
cliente espera respuesta y el contacto esta bloqueado o el monto es alto
(≥ `HIGH_VALUE_MXN`); bajo si esperar no pierde nada. Revision humana en
escalamientos, montos altos, rechazos y texto con forma de instruccion.

**Incertidumbre y limitaciones.** Sin calibracion estadistica. Heuristica
basada en palabras clave (el modo live es mas robusto). Almacen en memoria (se
pierde al reiniciar). Sin aprendizaje a partir de resultados aun
(ver `docs/NOTAS_AUDIO.md`: retroalimentacion y perfiles como siguiente paso).
El nombre del campo de `action.executed` se confirmara con `contratos.json`.
