// Reglas obligatorias R1-R6 (seccion 5 del PDF) como logica deterministica.
// Se usan dos veces:
//   1) allowedActions(): para que la politica solo proponga acciones validas.
//   2) validateRecommendation(): auditoria final ANTES de publicar, sin
//      importar si la propuesta vino de la IA o de la politica. Si falla, el
//      agente sustituye por una alternativa segura (nunca publica una
//      infraccion de R1-R4).

import type { CaseContext } from '@/lib/agent/context'
import { isIsoDate } from '@/lib/events/parse'
import {
  ACTIONS,
  CONTACT_ACTIONS,
  LEVELS,
  TIMINGS,
  type Action,
  type Recommendation,
  type RuleCheck,
} from '@/lib/decisions/types'

export interface ActionGate {
  allowed: Set<Action>
  blockedBy: Partial<Record<Action, string[]>>
  earliestContact: string | null // primera fecha en que el contacto seria valido (R3/R4)
}

function block(gate: ActionGate, action: Action, why: string) {
  gate.allowed.delete(action)
  ;(gate.blockedBy[action] ??= []).push(why)
}

export function allowedActions(ctx: CaseContext): ActionGate {
  const gate: ActionGate = { allowed: new Set(ACTIONS), blockedBy: {}, earliestContact: null }
  const now = Date.parse(ctx.now)

  // R1 Caso cerrado: unicamente no_action.
  if (ctx.closed) {
    for (const a of ACTIONS) if (a !== 'no_action') block(gate, a, 'R1: caso cerrado')
    return gate
  }

  // R2 contact_allowed=false prohibe contact/request_information/resolve_objection.
  if (!ctx.contact_allowed) {
    for (const a of CONTACT_ACTIONS) block(gate, a, 'R2: contact_allowed=false')
  }

  // R3 Antes de contact_not_before se prohiben las mismas tres.
  if (ctx.contact_not_before && Date.parse(ctx.contact_not_before) > now) {
    for (const a of CONTACT_ACTIONS) block(gate, a, `R3: no contactar antes de ${ctx.contact_not_before}`)
    gate.earliestContact = ctx.contact_not_before
  }

  // R4 24h tras contact/request_information, salvo nuevo message.received.
  if (ctx.cooldown_until) {
    for (const a of CONTACT_ACTIONS) block(gate, a, `R4: ultimo contacto hace <24h (libre a partir de ${ctx.cooldown_until})`)
    if (!gate.earliestContact || Date.parse(ctx.cooldown_until) > Date.parse(gate.earliestContact)) {
      gate.earliestContact = ctx.cooldown_until
    }
  }

  return gate
}

// Frases que presentan aperturas como intencion confirmada o empujan
// descuento/cierre/urgencia (R5).
const R5_PATTERNS = /intenci[oó]n (de compra )?confirmada|(est[aá]|esta) list[oa] para comprar|(?<!sin |no )ofrecer (un )?descuento|cerrar (la )?venta (ya|hoy|de inmediato)|urgente cerrar|alta intenci[oó]n de compra/i

export function validateRecommendation(rec: Recommendation, ctx: CaseContext): RuleCheck[] {
  const checks: RuleCheck[] = []
  const isContact = CONTACT_ACTIONS.includes(rec.action)
  const caseEventIds = new Set(ctx.events.map((e) => e.event_id))

  // --- Contrato (seccion 6) ---
  const contractErrors: string[] = []
  if (rec.case_id !== ctx.case_id) contractErrors.push('case_id no coincide')
  if (!ACTIONS.includes(rec.action)) contractErrors.push(`action invalida: ${rec.action}`)
  if (!TIMINGS.includes(rec.timing)) contractErrors.push(`timing invalido: ${rec.timing}`)
  if (!LEVELS.includes(rec.confidence)) contractErrors.push('confidence invalida')
  if (!LEVELS.includes(rec.risk_level)) contractErrors.push('risk_level invalido')
  if (rec.timing === 'at_date' && !isIsoDate(rec.scheduled_for)) contractErrors.push('at_date requiere scheduled_for ISO')
  if (rec.timing !== 'at_date' && rec.scheduled_for !== null) contractErrors.push('scheduled_for debe ser null si timing != at_date')
  if (rec.action === 'wait' && !['at_date', 'on_new_information'].includes(rec.timing)) contractErrors.push('wait debe usar at_date u on_new_information')
  if (rec.action === 'no_action' && rec.timing !== 'not_applicable') contractErrors.push('no_action debe usar not_applicable')
  if (!['wait', 'no_action'].includes(rec.action) && !['immediate', 'within_24h', 'at_date'].includes(rec.timing)) {
    contractErrors.push(`${rec.action} debe usar immediate, within_24h o at_date`)
  }
  if (!rec.reason?.trim()) contractErrors.push('reason vacia')
  if (!rec.confidence_reason?.trim()) contractErrors.push('confidence_reason vacia')
  if (rec.evidence_event_ids.length === 0) contractErrors.push('sin evidencia')
  const foreign = rec.evidence_event_ids.filter((id) => !caseEventIds.has(id))
  if (foreign.length) contractErrors.push(`evidencia inexistente en el caso: ${foreign.join(', ')}`)
  checks.push({ rule: 'CONTRACT', passed: contractErrors.length === 0, detail: contractErrors.join('; ') || 'Cumple el contrato de recomendacion' })

  // --- R1 ---
  checks.push({
    rule: 'R1',
    passed: !ctx.closed || rec.action === 'no_action',
    detail: ctx.closed ? 'Caso cerrado: solo se permite no_action' : 'Caso abierto',
  })

  // Momento efectivo de la accion: ahora, o scheduled_for si at_date.
  // Una accion de contacto "agendada" despues de R3/R4 es valida; con R2 nunca.
  const effective = rec.timing === 'at_date' && rec.scheduled_for ? Date.parse(rec.scheduled_for) : Date.parse(ctx.now)

  // --- R2 --- (no se puede "agendar" contacto si contact_allowed=false)
  checks.push({
    rule: 'R2',
    passed: ctx.contact_allowed || !isContact,
    detail: ctx.contact_allowed ? 'Contacto permitido' : 'contact_allowed=false: no se permiten acciones de contacto',
  })

  // --- R3 ---
  const nb = ctx.contact_not_before ? Date.parse(ctx.contact_not_before) : null
  checks.push({
    rule: 'R3',
    passed: !isContact || nb === null || effective >= nb,
    detail: nb === null ? 'Sin contact_not_before' : `contact_not_before=${ctx.contact_not_before}`,
  })

  // --- R4 ---
  const cd = ctx.cooldown_until ? Date.parse(ctx.cooldown_until) : null
  // "within_24h" no garantiza esperar: se trata como inmediato para R4.
  checks.push({
    rule: 'R4',
    passed: !isContact || cd === null || (rec.timing === 'at_date' && effective >= cd),
    detail: cd === null ? 'Sin enfriamiento de 24h activo' : `Enfriamiento activo hasta ${ctx.cooldown_until}`,
  })

  // --- R5 --- aperturas no son intencion confirmada
  const onlyViews = ctx.messages.length === 0 && ctx.views.length > 0
  const text = `${rec.reason} ${rec.confidence_reason}`
  const r5Text = R5_PATTERNS.test(text)
  const r5Urgency = onlyViews && rec.action === 'contact' && rec.timing === 'immediate' && rec.confidence === 'high'
  checks.push({
    rule: 'R5',
    passed: !r5Text && !r5Urgency,
    detail: r5Text
      ? 'La explicacion presenta aperturas como intencion o sugiere descuento/cierre'
      : r5Urgency
        ? 'Solo hay aperturas: no justifican urgencia inmediata con confianza alta'
        : 'No se usan aperturas como intencion confirmada',
  })

  // --- R6 --- reconocer informacion faltante
  const needsMissing = !ctx.opened || ctx.proposal_amount_mxn === null || ctx.messages.length === 0
  checks.push({
    rule: 'R6',
    passed: !needsMissing || rec.missing_information.length > 0 || Boolean(ctx.closed),
    detail: needsMissing ? 'Hay informacion esencial faltante que debe declararse' : 'Informacion esencial disponible',
  })

  return checks
}

export function hardViolations(checks: RuleCheck[]): RuleCheck[] {
  return checks.filter((c) => !c.passed && ['R1', 'R2', 'R3', 'R4', 'CONTRACT'].includes(c.rule))
}
