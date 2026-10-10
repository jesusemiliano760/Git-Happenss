import { EVENT_TYPES, type CaseEvent, type EventValidationError } from './types'

const EVENT_TYPE_SET = new Set<string>(EVENT_TYPES)

// ISO 8601 con zona explicita (Z u offset). El kit esta en UTC.
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && ISO_RE.test(value) && !Number.isNaN(Date.parse(value))
}

// Valida una linea del JSONL. Regresa el evento o un error; nunca lanza, para
// que un evento malo no detenga los demas casos (seccion 2 del PDF).
export function parseEventLine(raw: string, line: number): CaseEvent | EventValidationError {
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch (e) {
    return { line, error: `JSON invalido: ${(e as Error).message}`, raw }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { line, error: 'La linea no es un objeto JSON', raw }
  }
  const o = obj as Record<string, unknown>
  const base = {
    line,
    raw,
    event_id: typeof o.event_id === 'string' ? o.event_id : undefined,
    case_id: typeof o.case_id === 'string' ? o.case_id : undefined,
  }
  if (typeof o.event_id !== 'string' || !o.event_id.trim()) return { ...base, error: 'event_id faltante o vacio' }
  if (typeof o.case_id !== 'string' || !o.case_id.trim()) return { ...base, error: 'case_id faltante o vacio' }
  if (typeof o.event_type !== 'string' || !EVENT_TYPE_SET.has(o.event_type)) {
    return { ...base, error: `event_type invalido: ${JSON.stringify(o.event_type)}` }
  }
  if (!isIsoDate(o.occurred_at)) return { ...base, error: `occurred_at no es ISO 8601: ${JSON.stringify(o.occurred_at)}` }
  const data = o.data ?? {}
  if (typeof data !== 'object' || Array.isArray(data) || data === null) return { ...base, error: 'data debe ser un objeto' }

  const ev = { ...o, data } as unknown as CaseEvent
  const dataError = validateEventData(ev)
  if (dataError) return { ...base, error: dataError }
  return ev
}

// Validacion minima de `data` por tipo (contrato de la seccion 4). Se mantiene
// permisiva con campos extra: el kit del jurado puede traer variantes.
function validateEventData(ev: CaseEvent): string | null {
  const d = ev.data
  switch (ev.event_type) {
    case 'message.received':
      if (typeof d.message !== 'string') return 'message.received requiere data.message (string)'
      return null
    case 'action.executed': {
      const kind = actionKind(ev)
      if (!kind) return 'action.executed requiere data.action (contact | request_information)'
      return null
    }
    case 'constraint.updated':
      if (d.contact_allowed === undefined && d.contact_not_before === undefined) {
        return 'constraint.updated requiere contact_allowed o contact_not_before'
      }
      if (d.contact_allowed !== undefined && d.contact_allowed !== null && typeof d.contact_allowed !== 'boolean') {
        return 'contact_allowed debe ser boolean'
      }
      if (d.contact_not_before !== undefined && d.contact_not_before !== null && !isIsoDate(d.contact_not_before)) {
        return 'contact_not_before debe ser fecha ISO 8601'
      }
      return null
    case 'case.opened':
      if (d.proposal_amount_mxn !== undefined && typeof d.proposal_amount_mxn !== 'number') {
        return 'proposal_amount_mxn debe ser numero'
      }
      return null
    default:
      return null
  }
}

// El PDF dice "action.executed registra contact o request_information" pero no
// fija el nombre del campo; aceptamos los nombres razonables hasta tener
// contratos.json del kit.
export function actionKind(ev: CaseEvent): 'contact' | 'request_information' | null {
  const d = ev.data
  const v = d.action ?? d.action_type ?? d.type ?? d.kind
  return v === 'contact' || v === 'request_information' ? v : null
}

export function parseJsonl(text: string): { events: CaseEvent[]; errors: EventValidationError[] } {
  const events: CaseEvent[] = []
  const errors: EventValidationError[] = []
  text.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim()) return
    const r = parseEventLine(raw, i + 1)
    if ('error' in r) errors.push(r)
    else events.push(r)
  })
  return { events, errors }
}
