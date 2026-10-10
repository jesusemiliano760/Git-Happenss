// "Distinguir hechos observados, inferencias e informacion faltante"
// (seccion 2). Se arma para la pantalla de detalle a partir del contexto
// deterministico (hechos), las interpretaciones de los mensajes (inferencias)
// y la recomendacion vigente (faltantes).
import type { CaseContext } from './context'
import type { MessageInterpretation } from './interpreter'
import type { Recommendation } from '@/lib/decisions/types'

export interface CaseAnalysis {
  facts: string[]
  inferences: string[]
  missing: string[]
}

export function buildAnalysis(
  ctx: CaseContext,
  interps: Map<string, MessageInterpretation>,
  rec: Recommendation | null,
): CaseAnalysis {
  const facts: string[] = []
  if (ctx.opened) {
    const amount = ctx.proposal_amount_mxn
    facts.push(`Propuesta enviada el ${ctx.opened.occurred_at}${amount !== null ? ` por ${amount.toLocaleString('es-MX')} MXN` : ''} (${ctx.opened.event_id}).`)
  }
  if (ctx.closed) facts.push(`Caso cerrado el ${ctx.closed.occurred_at} con status=${String(ctx.closed.data.status ?? 'closed')} (${ctx.closed.event_id}).`)
  if (!ctx.contact_allowed) facts.push(`Contacto prohibido: contact_allowed=false (${ctx.contact_allowed_event?.event_id}).`)
  if (ctx.contact_not_before) facts.push(`No contactar antes de ${ctx.contact_not_before} (${ctx.contact_not_before_event?.event_id}).`)
  if (ctx.views.length) {
    const sections = ctx.metrics.sections_viewed.length ? `, secciones: ${ctx.metrics.sections_viewed.join(', ')}` : ''
    facts.push(`La propuesta se abrió ${ctx.views.length} ${ctx.views.length === 1 ? 'vez' : 'veces'}${sections}.`)
  }
  if (ctx.last_contact_action) {
    facts.push(`Último seguimiento (${String(ctx.last_contact_action.data.action)}) el ${ctx.last_contact_action.occurred_at} (${ctx.last_contact_action.event_id}).`)
  }
  if (ctx.cooldown_until) facts.push(`Espera de 24 h (R4) vigente hasta ${ctx.cooldown_until}.`)
  for (const m of ctx.messages) facts.push(`El cliente escribió el ${m.occurred_at}: "${String(m.data.message ?? '').slice(0, 160)}" (${m.event_id}).`)
  if (ctx.future_events_ignored) facts.push(`${ctx.future_events_ignored} evento(s) con fecha posterior a la hora de evaluación (${ctx.now}) no se usan.`)

  const inferences: string[] = []
  for (const m of ctx.messages) {
    const i = interps.get(m.event_id)
    if (!i) continue
    const by = i.source === 'llm' ? 'IA' : 'reglas de respaldo'
    for (const inf of i.inferences) inferences.push(`${m.event_id} (${by}, confianza ${i.confidence}): ${inf}`)
  }
  if (!ctx.messages.length && ctx.views.length) {
    inferences.push('Las aperturas pueden indicar interés o solo curiosidad; no confirman intención de compra (R5).')
  }

  const missing = [...new Set([...(rec?.missing_information ?? []), ...ctx.messages.flatMap((m) => interps.get(m.event_id)?.missing_information ?? [])])]
  return { facts, inferences, missing }
}
