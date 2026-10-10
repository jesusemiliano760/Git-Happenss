// Contrato de entrada del reto (seccion 4 del PDF). Cada linea de
// events.jsonl es un CaseEvent. Los campos de `data` cambian por tipo de
// evento; los detalles finos estan en data/kit/contratos.json cuando el kit
// oficial se copie ahi.

export const EVENT_TYPES = [
  'case.opened',
  'proposal.viewed',
  'message.received',
  'action.executed',
  'constraint.updated',
  'case.closed',
] as const

export type EventType = (typeof EVENT_TYPES)[number]

export interface CaseEvent {
  event_id: string
  case_id: string
  event_type: EventType
  occurred_at: string // ISO 8601 UTC
  data: Record<string, unknown>
}

export interface EventValidationError {
  line: number
  event_id?: string
  case_id?: string
  error: string
  raw: string
}

export interface IngestResult {
  accepted: CaseEvent[]
  duplicates: { line: number; event_id: string }[]
  errors: EventValidationError[]
  affectedCaseIds: string[]
}

// Manifest del kit: la hora de evaluacion viene de aqui, NO del reloj real,
// para que las pruebas sean repetibles (seccion 4 del PDF).
export interface Manifest {
  evaluation_time: string
  [key: string]: unknown
}
