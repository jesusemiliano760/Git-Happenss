// Politica de "siguiente mejor accion". Recibe HECHOS (CaseContext),
// INFERENCIAS de la IA (MessageInterpretation) y las acciones permitidas por
// las reglas (ActionGate), y propone una recomendacion. La propuesta se
// vuelve a auditar en lib/rules/engine.ts antes de publicarse.
//
// Criterio general (lo que pidio el patrocinador): no siempre hay que actuar.
// Esperar o no hacer nada es una decision valida cuando el contexto lo
// justifica, y las aperturas por si solas nunca son intencion confirmada.

import type { CaseContext } from './context'
import type { MessageInterpretation } from './interpreter'
import type { ActionGate } from '@/lib/rules/engine'
import type { Action, Level, Recommendation, Timing } from '@/lib/decisions/types'

// Umbral a partir del cual una propuesta se considera de alto valor y se pide
// revision humana en decisiones delicadas. Ajustable sin tocar la logica.
export const HIGH_VALUE_MXN = Number(process.env.HIGH_VALUE_MXN ?? 500_000)
// Dias sin respuesta tras un seguimiento antes de volver a intentar.
export const FOLLOW_UP_GAP_DAYS = 3

const DAY = 24 * 60 * 60 * 1000

interface Draft {
  action: Action
  timing: Timing
  scheduled_for?: string | null
  reason: string
  evidence: (string | undefined | null)[]
  confidence: Level
  confidence_reason: string
  risk_level: Level
  requires_human_review?: boolean
  missing?: string[]
}

function iso(ms: number) {
  return new Date(ms).toISOString()
}

function laterOf(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return Date.parse(a) >= Date.parse(b) ? a : b
}

export function baseMissingInformation(ctx: CaseContext): string[] {
  const missing: string[] = []
  if (!ctx.opened) missing.push('Evento case.opened (estado y monto de la propuesta)')
  else if (ctx.proposal_amount_mxn === null) missing.push('Monto de la propuesta (proposal_amount_mxn)')
  if (ctx.messages.length === 0) missing.push('Respuesta explicita del cliente: solo hay senales indirectas (aperturas)')
  return missing
}

export function decide(
  ctx: CaseContext,
  interps: Map<string, MessageInterpretation>,
  gate: ActionGate,
): Recommendation {
  const draft = decideDraft(ctx, interps, gate)
  const missing = [...new Set([...baseMissingInformation(ctx), ...(draft.missing ?? [])])]
  const evidence = [...new Set(draft.evidence.filter((x): x is string => Boolean(x)))]
  return {
    case_id: ctx.case_id,
    action: draft.action,
    timing: draft.timing,
    scheduled_for: draft.timing === 'at_date' ? draft.scheduled_for ?? null : null,
    reason: draft.reason,
    evidence_event_ids: evidence.length ? evidence : ctx.events.slice(-1).map((e) => e.event_id),
    confidence: draft.confidence,
    confidence_reason: draft.confidence_reason,
    risk_level: draft.risk_level,
    requires_human_review: draft.requires_human_review ?? false,
    missing_information: ctx.closed ? [] : missing,
  }
}

function decideDraft(ctx: CaseContext, interps: Map<string, MessageInterpretation>, gate: ActionGate): Draft {
  const now = Date.parse(ctx.now)
  const openedId = ctx.opened?.event_id
  const highValue = (ctx.proposal_amount_mxn ?? 0) >= HIGH_VALUE_MXN

  // Mensaje "pendiente": el ultimo mensaje que llego despues del ultimo
  // contacto (o cualquiera si nunca se ha contactado).
  const pendingMsg = ctx.last_contact_action
    ? ctx.messages_after_last_contact[ctx.messages_after_last_contact.length - 1] ?? null
    : ctx.last_message
  const lastInterp = ctx.last_message ? interps.get(ctx.last_message.event_id) : undefined
  const pending = pendingMsg ? interps.get(pendingMsg.event_id) : undefined
  const injection = [...interps.values()].some((i) => i.injection_suspected)
  const injectionNote = injection ? ' Un mensaje contiene texto con forma de instruccion; se trato solo como dato.' : ''

  // 1) R1: caso cerrado.
  if (ctx.closed) {
    return {
      action: 'no_action',
      timing: 'not_applicable',
      reason: `El caso se cerro (status=${ctx.status}) en ${ctx.closed.occurred_at}. Un cierre es definitivo: no hay intervencion valida.`,
      evidence: [ctx.closed.event_id],
      confidence: 'high',
      confidence_reason: 'Hecho observado: existe un evento case.closed. No depende de interpretacion.',
      risk_level: 'low',
    }
  }

  // 2) El cliente pidio explicitamente no ser contactado.
  if (lastInterp?.asks_no_contact) {
    return {
      action: 'escalate',
      timing: 'immediate',
      reason:
        'El cliente pidio por escrito no ser contactado. Se escala para que una persona registre la restriccion y decida si se cierra el caso; no se envia ningun mensaje al cliente.' +
        injectionNote,
      evidence: [ctx.last_message?.event_id, openedId],
      confidence: lastInterp.confidence === 'low' ? 'medium' : lastInterp.confidence,
      confidence_reason: `Interpretacion (${lastInterp.source}) del ultimo mensaje: solicitud de no contacto. Es una inferencia sobre texto libre, por eso se pide revision humana.`,
      risk_level: 'high',
      requires_human_review: true,
    }
  }

  // 3) Rechazo explicito: no insistir.
  if (lastInterp?.intent === 'not_interested') {
    return {
      action: 'no_action',
      timing: 'not_applicable',
      reason: 'El ultimo mensaje del cliente rechaza la propuesta. Insistir tiene mas riesgo que beneficio; se recomienda que una persona confirme y cierre el caso.',
      evidence: [ctx.last_message?.event_id, openedId],
      confidence: lastInterp.confidence,
      confidence_reason: `Inferencia (${lastInterp.source}) sobre el texto del cliente; el caso aun no tiene case.closed.`,
      risk_level: 'low',
      requires_human_review: true,
    }
  }

  // 4) R2: contacto prohibido.
  if (!ctx.contact_allowed) {
    const clientWaiting = pending && ['objection', 'requests_information', 'interested'].includes(pending.intent)
    if (clientWaiting) {
      return {
        action: 'escalate',
        timing: 'immediate',
        reason: `El cliente espera respuesta (${pending.intent}) pero contact_allowed=false. Se escala a revision interna; no se redacta ni envia ningun mensaje al cliente.${injectionNote}`,
        evidence: [pendingMsg?.event_id, ctx.contact_allowed_event?.event_id],
        confidence: 'high',
        confidence_reason: 'La restriccion es un hecho observado (constraint.updated) y hay un mensaje del cliente pendiente.',
        risk_level: 'high',
        requires_human_review: true,
      }
    }
    return {
      action: 'wait',
      timing: 'on_new_information',
      reason: 'contact_allowed=false prohibe contactar. Reevaluar cuando llegue un constraint.updated que lo permita o un nuevo mensaje del cliente.',
      evidence: [ctx.contact_allowed_event?.event_id, openedId],
      confidence: 'high',
      confidence_reason: 'Decision determinada por una restriccion explicita (R2), no por interpretacion.',
      risk_level: 'medium',
      requires_human_review: highValue,
    }
  }

  // 5) El cliente pidio esperar hasta una fecha.
  if (lastInterp?.intent === 'requests_wait') {
    const requested = lastInterp.requested_contact_after
    if (requested && Date.parse(requested) > now) {
      const at = laterOf(requested, gate.earliestContact)!
      return {
        action: 'wait',
        timing: 'at_date',
        scheduled_for: at,
        reason: `El cliente pidio retomar despues de ${requested.slice(0, 10)}. Reevaluar el ${at.slice(0, 10)} o antes si llega un mensaje nuevo.`,
        evidence: [ctx.last_message?.event_id, ctx.contact_not_before_event?.event_id],
        confidence: lastInterp.confidence,
        confidence_reason: `La fecha se infirio (${lastInterp.source}) del texto del cliente; si el mensaje es vago, la fecha exacta puede variar.`,
        risk_level: 'low',
        missing: lastInterp.missing_information,
      }
    }
    if (!requested) {
      return {
        action: 'wait',
        timing: 'on_new_information',
        reason: 'El cliente pidio posponer sin fecha concreta. Respetar la pausa y reevaluar cuando escriba de nuevo.',
        evidence: [ctx.last_message?.event_id],
        confidence: 'medium',
        confidence_reason: 'La solicitud de espera es clara pero no tiene fecha verificable.',
        risk_level: 'low',
        missing: ['Fecha en la que el cliente acepta ser contactado'],
      }
    }
    // Fecha pedida ya paso: se sigue con el flujo normal.
  }

  // 6) R3 / R4: hay una fecha minima de contacto en el futuro.
  if (gate.earliestContact && Date.parse(gate.earliestContact) > now) {
    const isR3 = ctx.contact_not_before && gate.earliestContact === ctx.contact_not_before
    return {
      action: 'wait',
      timing: 'at_date',
      scheduled_for: gate.earliestContact,
      reason: isR3
        ? `Existe contact_not_before=${ctx.contact_not_before}. Reevaluar en esa fecha${pending ? ' y atender el mensaje pendiente del cliente' : ''}.`
        : `Ya se contacto al cliente hace menos de 24h sin respuesta nueva (R4). Reevaluar a partir de ${gate.earliestContact}.`,
      evidence: [isR3 ? ctx.contact_not_before_event?.event_id : ctx.last_contact_action?.event_id, pendingMsg?.event_id],
      confidence: 'high',
      confidence_reason: 'Decision determinada por una regla de tiempo verificable.',
      risk_level: pending && pending.intent !== 'ambiguous' ? 'medium' : 'low',
      requires_human_review: Boolean(pending && highValue),
    }
  }

  // 7) Hay un mensaje del cliente sin atender.
  if (pending && pendingMsg) {
    const conf = pending.confidence
    const confReason = `Basado en la interpretacion (${pending.source}) del mensaje ${pendingMsg.event_id}. ${pending.inferences[0] ?? ''}`.trim()
    switch (pending.intent) {
      case 'objection':
      case 'requests_information':
        return {
          action: 'resolve_objection',
          timing: 'immediate',
          reason: `El cliente expreso explicitamente ${pending.intent === 'objection' ? `una objecion (${pending.objection_topic ?? 'tema no especificado'})` : 'una pregunta'}. Conviene aclararla sin ofrecer descuentos ni presionar el cierre.${injectionNote}`,
          evidence: [pendingMsg.event_id, openedId],
          confidence: conf,
          confidence_reason: confReason,
          risk_level: highValue ? 'high' : 'medium',
          requires_human_review: highValue || injection,
          missing: pending.missing_information,
        }
      case 'interested':
        return {
          action: highValue ? 'escalate' : 'contact',
          timing: highValue ? 'immediate' : 'within_24h',
          reason: highValue
            ? `El cliente expreso interes por escrito en una propuesta de alto valor (${ctx.proposal_amount_mxn} MXN). Se escala a una persona responsable para el siguiente paso.`
            : 'El cliente expreso interes por escrito. Dar seguimiento breve para acordar el siguiente paso, sin asumir que la compra esta decidida.',
          evidence: [pendingMsg.event_id, openedId],
          confidence: conf,
          confidence_reason: confReason,
          risk_level: 'medium',
          requires_human_review: highValue || injection,
          missing: pending.missing_information,
        }
      case 'provides_information':
        return {
          action: 'contact',
          timing: 'within_24h',
          reason: 'El cliente compartio informacion. Dar seguimiento breve para confirmar recepcion y el siguiente paso.',
          evidence: [pendingMsg.event_id, openedId],
          confidence: conf,
          confidence_reason: confReason,
          risk_level: 'low',
          requires_human_review: injection,
          missing: pending.missing_information,
        }
      case 'ambiguous':
      default:
        return {
          action: 'request_information',
          timing: 'within_24h',
          reason: 'El mensaje del cliente no deja clara su intencion. Pedir el dato necesario para avanzar en lugar de suponer.',
          evidence: [pendingMsg.event_id, openedId],
          confidence: 'low',
          confidence_reason: `${confReason} El mensaje es ambiguo, por eso la confianza es baja.`,
          risk_level: 'low',
          requires_human_review: injection,
          missing: [...pending.missing_information, 'Intencion explicita del cliente'],
        }
    }
  }

  // 8) Sin mensajes pendientes: solo senales indirectas.
  if (ctx.last_contact_action) {
    const lastContact = Date.parse(ctx.last_contact_action.occurred_at)
    const viewsSince = ctx.views.filter((v) => Date.parse(v.occurred_at) > lastContact)
    const retryAt = lastContact + FOLLOW_UP_GAP_DAYS * DAY
    if (retryAt > now) {
      return {
        action: 'wait',
        timing: 'at_date',
        scheduled_for: iso(retryAt),
        reason: `Ya se dio seguimiento el ${ctx.last_contact_action.occurred_at.slice(0, 10)} y el cliente no ha respondido${viewsSince.length ? ` (hubo ${viewsSince.length} apertura(s), que no confirman intencion)` : ''}. Insistir antes de ${FOLLOW_UP_GAP_DAYS} dias puede ser contraproducente.`,
        evidence: [ctx.last_contact_action.event_id, ...viewsSince.map((v) => v.event_id)],
        confidence: 'medium',
        confidence_reason: 'Basado en tiempos observados; no hay mensaje del cliente que confirme su interes.',
        risk_level: 'low',
      }
    }
    return {
      action: 'contact',
      timing: 'within_24h',
      reason: `Han pasado mas de ${FOLLOW_UP_GAP_DAYS} dias desde el ultimo seguimiento sin respuesta. Un recordatorio breve es razonable, sin afirmar intencion de compra.`,
      evidence: [ctx.last_contact_action.event_id, ...viewsSince.map((v) => v.event_id), openedId],
      confidence: 'low',
      confidence_reason: 'Solo hay silencio y, en su caso, aperturas; ninguna confirma interes.',
      risk_level: 'low',
    }
  }

  if (ctx.views.length > 0) {
    const lastView = ctx.views[ctx.views.length - 1]
    const m = ctx.metrics
    const burst = m.view_count >= 3 || (m.minutes_to_first_view !== null && m.minutes_to_first_view <= 10)
    return {
      action: 'contact',
      timing: 'within_24h',
      reason: `La propuesta se abrio ${m.view_count} ${m.view_count === 1 ? "vez" : "veces"} (ultima ${lastView.occurred_at.slice(0, 16)}Z${m.minutes_to_first_view !== null ? `, primera apertura ${m.minutes_to_first_view} min despues del envio` : ''}) y aun no hay seguimiento. ${burst ? 'El patron puede indicar interes o solo curiosidad: ' : ''}un contacto breve es razonable para averiguarlo; las aperturas no confirman intencion ni justifican descuentos o urgencia.`,
      evidence: [...ctx.views.map((v) => v.event_id), openedId],
      confidence: 'low',
      confidence_reason: 'Solo hay aperturas (senal indirecta, R5). No hay mensaje del cliente.',
      risk_level: 'low',
    }
  }

  if (ctx.opened) {
    const openedAt = Date.parse(ctx.opened.occurred_at)
    const nudgeAt = openedAt + FOLLOW_UP_GAP_DAYS * DAY
    if (nudgeAt > now) {
      return {
        action: 'wait',
        timing: 'at_date',
        scheduled_for: iso(nudgeAt),
        reason: `La propuesta se envio hace poco y no hay senales del cliente. Reevaluar el ${iso(nudgeAt).slice(0, 10)} o antes si hay aperturas o mensajes.`,
        evidence: [openedId],
        confidence: 'medium',
        confidence_reason: 'Sin senales del cliente; la decision se basa solo en el tiempo transcurrido.',
        risk_level: 'low',
      }
    }
    return {
      action: 'contact',
      timing: 'within_24h',
      reason: `La propuesta lleva mas de ${FOLLOW_UP_GAP_DAYS} dias sin aperturas ni respuesta. Un recordatorio breve puede confirmar que la recibio.`,
      evidence: [openedId],
      confidence: 'low',
      confidence_reason: 'No hay ninguna senal del cliente; podria no haber visto la propuesta.',
      risk_level: 'low',
    }
  }

  return {
    action: 'wait',
    timing: 'on_new_information',
    reason: 'No hay informacion suficiente sobre el caso (falta case.opened). Esperar nuevos eventos.',
    evidence: ctx.events.slice(-1).map((e) => e.event_id),
    confidence: 'low',
    confidence_reason: 'Historial incompleto.',
    risk_level: 'medium',
    requires_human_review: true,
  }
}

// Alternativa segura si la propuesta viola una regla dura (no deberia pasar,
// pero el validador es la ultima linea de defensa).
export function safeFallback(ctx: CaseContext, gate: ActionGate, why: string): Recommendation {
  const evidence = ctx.events.slice(-1).map((e) => e.event_id)
  if (ctx.closed) {
    return {
      case_id: ctx.case_id, action: 'no_action', timing: 'not_applicable', scheduled_for: null,
      reason: 'Caso cerrado.', evidence_event_ids: [ctx.closed.event_id], confidence: 'high',
      confidence_reason: 'Hecho observado.', risk_level: 'low', requires_human_review: false, missing_information: [],
    }
  }
  const at = gate.earliestContact && Date.parse(gate.earliestContact) > Date.parse(ctx.now) ? gate.earliestContact : null
  return {
    case_id: ctx.case_id,
    action: 'wait',
    timing: at ? 'at_date' : 'on_new_information',
    scheduled_for: at,
    reason: `Se descarto la propuesta original por una regla (${why}). Esperar ${at ? `hasta ${at}` : 'nueva informacion'} y revisar manualmente.`,
    evidence_event_ids: evidence,
    confidence: 'low',
    confidence_reason: 'Recomendacion de resguardo tras una validacion fallida.',
    risk_level: 'medium',
    requires_human_review: true,
    missing_information: baseMissingInformation(ctx),
  }
}
