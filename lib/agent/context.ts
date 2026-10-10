import type { CaseEvent } from '@/lib/events/types'
import { actionKind } from '@/lib/events/parse'

// Estado del caso reconstruido 100% de forma deterministica a partir del
// historial. Esto es lo que separa HECHOS OBSERVADOS (aqui) de INFERENCIAS
// (interpreter.ts, IA) y de INFORMACION FALTANTE.

export interface CaseContext {
  case_id: string
  now: string
  events: CaseEvent[] // solo eventos con occurred_at <= now
  future_events_ignored: number
  opened: CaseEvent | null
  status: string | null
  proposal_amount_mxn: number | null
  closed: CaseEvent | null
  contact_allowed: boolean // default true si nadie lo ha restringido
  contact_allowed_event: CaseEvent | null
  contact_not_before: string | null
  contact_not_before_event: CaseEvent | null
  views: CaseEvent[]
  messages: CaseEvent[]
  last_message: CaseEvent | null
  last_contact_action: CaseEvent | null // ultimo action.executed contact/request_information
  messages_after_last_contact: CaseEvent[]
  cooldown_until: string | null // R4: last_contact + 24h, null si no aplica
  metrics: EngagementMetrics
}

// "La metrica entre cada accion" (audio del patrocinador): tiempos entre
// senales. Son hechos medibles; su lectura (interes vs curiosidad) es
// ambigua y se reporta como tal.
export interface EngagementMetrics {
  view_count: number
  minutes_to_first_view: number | null // desde case.opened
  views_last_24h: number
  hours_since_last_activity: number | null
  hours_since_last_contact: number | null
  hours_to_first_reply: number | null // desde case.opened al primer mensaje
  sections_viewed: string[] // proposal.viewed.data.section (ej. "price")
}

export const COOLDOWN_MS = 24 * 60 * 60 * 1000

// ISO 8601 UTC sin milisegundos (mismo formato que el kit).
export function toIso(ms: number): string {
  return new Date(ms).toISOString().replace('.000Z', 'Z')
}

export function buildContext(caseId: string, allEvents: CaseEvent[], now: string): CaseContext {
  const nowMs = Date.parse(now)
  const events = allEvents.filter((e) => Date.parse(e.occurred_at) <= nowMs)

  const ctx: CaseContext = {
    case_id: caseId,
    now,
    events,
    future_events_ignored: allEvents.length - events.length,
    opened: null,
    status: null,
    proposal_amount_mxn: null,
    closed: null,
    contact_allowed: true,
    contact_allowed_event: null,
    contact_not_before: null,
    contact_not_before_event: null,
    views: [],
    messages: [],
    last_message: null,
    last_contact_action: null,
    messages_after_last_contact: [],
    cooldown_until: null,
    metrics: {
      view_count: 0,
      minutes_to_first_view: null,
      views_last_24h: 0,
      hours_since_last_activity: null,
      hours_since_last_contact: null,
      hours_to_first_reply: null,
      sections_viewed: [],
    },
  }

  for (const ev of events) {
    const d = ev.data
    switch (ev.event_type) {
      case 'case.opened':
        ctx.opened = ev
        ctx.status = typeof d.status === 'string' ? d.status : ctx.status
        ctx.proposal_amount_mxn = typeof d.proposal_amount_mxn === 'number' ? d.proposal_amount_mxn : null
        break
      case 'proposal.viewed':
        ctx.views.push(ev)
        break
      case 'message.received':
        ctx.messages.push(ev)
        ctx.last_message = ev
        break
      case 'action.executed':
        if (actionKind(ev)) ctx.last_contact_action = ev
        break
      case 'constraint.updated':
        if (typeof d.contact_allowed === 'boolean') {
          ctx.contact_allowed = d.contact_allowed
          ctx.contact_allowed_event = ev
        }
        if ('contact_not_before' in d) {
          ctx.contact_not_before = typeof d.contact_not_before === 'string' ? d.contact_not_before : null
          ctx.contact_not_before_event = ev
        }
        break
      case 'case.closed':
        // Un cierre es definitivo para este kit (seccion 4).
        ctx.closed = ev
        ctx.status = typeof d.status === 'string' ? d.status : 'closed'
        break
    }
  }

  if (ctx.last_contact_action) {
    const t = Date.parse(ctx.last_contact_action.occurred_at)
    ctx.messages_after_last_contact = ctx.messages.filter((m) => Date.parse(m.occurred_at) > t)
    const until = t + COOLDOWN_MS
    if (until > nowMs && ctx.messages_after_last_contact.length === 0) {
      ctx.cooldown_until = toIso(until)
    }
  }

  const H = 60 * 60 * 1000
  const openedAt = ctx.opened ? Date.parse(ctx.opened.occurred_at) : null
  const m = ctx.metrics
  m.view_count = ctx.views.length
  m.sections_viewed = [...new Set(ctx.views.map((v) => v.data.section).filter((x): x is string => typeof x === 'string'))]
  if (openedAt !== null && ctx.views[0]) m.minutes_to_first_view = Math.round((Date.parse(ctx.views[0].occurred_at) - openedAt) / 60000)
  m.views_last_24h = ctx.views.filter((v) => nowMs - Date.parse(v.occurred_at) <= COOLDOWN_MS).length
  const last = events[events.length - 1]
  if (last) m.hours_since_last_activity = round1((nowMs - Date.parse(last.occurred_at)) / H)
  if (ctx.last_contact_action) m.hours_since_last_contact = round1((nowMs - Date.parse(ctx.last_contact_action.occurred_at)) / H)
  if (openedAt !== null && ctx.messages[0]) m.hours_to_first_reply = round1((Date.parse(ctx.messages[0].occurred_at) - openedAt) / H)

  return ctx
}

function round1(n: number) {
  return Math.round(n * 10) / 10
}

// Resumen compacto para mandarle al LLM: solo datos, sin instrucciones.
export function contextForPrompt(ctx: CaseContext) {
  return {
    case_id: ctx.case_id,
    now: ctx.now,
    status: ctx.status,
    closed: Boolean(ctx.closed),
    proposal_amount_mxn: ctx.proposal_amount_mxn,
    contact_allowed: ctx.contact_allowed,
    contact_not_before: ctx.contact_not_before,
    cooldown_until: ctx.cooldown_until,
    metrics: ctx.metrics,
    events: ctx.events.map((e) => ({
      event_id: e.event_id,
      event_type: e.event_type,
      occurred_at: e.occurred_at,
      data: e.data,
    })),
  }
}
