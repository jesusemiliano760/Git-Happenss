// Agente "What Should Happen Next?". Flujo por caso:
//
//   eventos -> buildContext (hechos)            [deterministico]
//           -> interpretMessage por mensaje     [IA: Claude o heuristica]
//           -> allowedActions (R1-R4)           [deterministico]
//           -> decide (politica)                [deterministico, usa inferencias]
//           -> validateRecommendation (R1-R6 + contrato) -> publicar o safeFallback
//
// La traza (TraceEntry[]) cumple el papel del panel "MCP Activity" de
// Banorte One: muestra al jurado cada paso y que regla se valido.

import { buildContext } from './context'
import { interpretMessage, type MessageInterpretation } from './interpreter'
import { decide, safeFallback } from './policy'
import { allowedActions, hardViolations, validateRecommendation } from '@/lib/rules/engine'
import type { CaseEvent } from '@/lib/events/types'
import type { DecisionRecord, Recommendation, TraceEntry } from '@/lib/decisions/types'

// Cache de interpretaciones por event_id: un mensaje no cambia, asi que no se
// vuelve a mandar al LLM en cada reevaluacion.
const g = globalThis as unknown as { __interpCache?: Map<string, MessageInterpretation> }
export const interpCache: Map<string, MessageInterpretation> = g.__interpCache ?? (g.__interpCache = new Map())

export async function evaluateCase(caseId: string, events: CaseEvent[], now: string): Promise<DecisionRecord> {
  const trace: TraceEntry[] = []
  const log = (step: string, detail: string) => trace.push({ step, detail, timestamp: new Date().toISOString() })

  const ctx = buildContext(caseId, events, now)
  log(
    'build_context',
    `${ctx.events.length} eventos hasta ${now}` +
      (ctx.future_events_ignored ? ` (${ctx.future_events_ignored} posteriores ignorados)` : '') +
      `; aperturas=${ctx.views.length}, mensajes=${ctx.messages.length}, contact_allowed=${ctx.contact_allowed}` +
      (ctx.contact_not_before ? `, contact_not_before=${ctx.contact_not_before}` : '') +
      (ctx.cooldown_until ? `, enfriamiento R4 hasta ${ctx.cooldown_until}` : ''),
  )

  const summary = `estado=${ctx.status ?? 'desconocido'}, monto_mxn=${ctx.proposal_amount_mxn ?? 'desconocido'}, aperturas=${ctx.views.length}`
  const interps = new Map<string, MessageInterpretation>()
  for (const msg of ctx.messages) {
    let interp = interpCache.get(msg.event_id)
    if (!interp) {
      interp = await interpretMessage(msg, summary)
      interpCache.set(msg.event_id, interp)
    }
    interps.set(msg.event_id, interp)
    log(
      'interpret_message',
      `${msg.event_id} -> ${interp.intent} (${interp.confidence}, ${interp.source})` +
        (interp.requested_contact_after ? ` pide esperar hasta ${interp.requested_contact_after}` : '') +
        (interp.injection_suspected ? ' [texto con forma de instruccion: tratado como dato]' : ''),
    )
  }

  const gate = allowedActions(ctx)
  log('allowed_actions', [...gate.allowed].join(', ') + (Object.keys(gate.blockedBy).length ? ` | bloqueadas: ${Object.entries(gate.blockedBy).map(([a, w]) => `${a} (${w?.[0]})`).join('; ')}` : ''))

  const proposed = decide(ctx, interps, gate)
  log('propose', `${proposed.action} / ${proposed.timing}${proposed.scheduled_for ? ` @ ${proposed.scheduled_for}` : ''}`)

  let recommendation: Recommendation = proposed
  let checks = validateRecommendation(proposed, ctx)
  const violations = hardViolations(checks)
  if (violations.length) {
    log('validate', `RECHAZADA: ${violations.map((v) => `${v.rule} ${v.detail}`).join(' | ')}`)
    recommendation = safeFallback(ctx, gate, violations.map((v) => v.rule).join(','))
    checks = validateRecommendation(recommendation, ctx)
    log('fallback', `${recommendation.action} / ${recommendation.timing}`)
  } else {
    const soft = checks.filter((c) => !c.passed)
    log('validate', soft.length ? `OK con advertencias: ${soft.map((c) => c.rule).join(', ')}` : 'OK: cumple R1-R6 y el contrato')
  }

  return {
    recommendation,
    evaluated_at: now,
    // 'live' solo si la IA externa realmente interpreto algun mensaje del caso.
    mode: [...interps.values()].some((i) => i.source === 'llm') ? 'live' : 'fallback',
    proposed,
    rule_checks: checks,
    trace,
    event_count: ctx.events.length,
  }
}

// Que cambio entre la decision anterior y la nueva (requisito de la
// seccion 2: "conservar la decision anterior para mostrar que cambio").
export function diffDecisions(prev: Recommendation | null, next: Recommendation) {
  if (!prev) return []
  const fields: (keyof Recommendation)[] = ['action', 'timing', 'scheduled_for', 'confidence', 'risk_level', 'requires_human_review']
  return fields
    .filter((f) => JSON.stringify(prev[f]) !== JSON.stringify(next[f]))
    .map((f) => ({ field: f, before: prev[f], after: next[f] }))
}
