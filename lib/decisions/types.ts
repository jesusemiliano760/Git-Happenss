// Contrato de recomendacion (seccion 6 del PDF). Todo lo que sale del agente
// se valida contra esto en lib/decisions/schema.ts antes de publicarse.

export const ACTIONS = ['contact', 'request_information', 'resolve_objection', 'escalate', 'wait', 'no_action'] as const
export type Action = (typeof ACTIONS)[number]

// Acciones que implican hablar con el cliente: R2, R3 y R4 las bloquean.
export const CONTACT_ACTIONS: readonly Action[] = ['contact', 'request_information', 'resolve_objection']

export const TIMINGS = ['immediate', 'within_24h', 'at_date', 'on_new_information', 'not_applicable'] as const
export type Timing = (typeof TIMINGS)[number]

export const LEVELS = ['low', 'medium', 'high'] as const
export type Level = (typeof LEVELS)[number]

export interface Recommendation {
  case_id: string
  action: Action
  timing: Timing
  scheduled_for: string | null
  reason: string
  evidence_event_ids: string[]
  confidence: Level
  confidence_reason: string
  risk_level: Level
  requires_human_review: boolean
  missing_information: string[]
}

// Lo que guardamos internamente por cada evaluacion: la recomendacion
// publicada + la traza de como se llego a ella (para la UI y la demo).
export interface DecisionRecord {
  recommendation: Recommendation
  evaluated_at: string // hora del manifest usada como "ahora"
  mode: 'live' | 'fallback'
  proposed: Recommendation | null // lo que propuso la IA antes de las reglas
  rule_checks: RuleCheck[]
  trace: TraceEntry[]
  event_count: number
}

export interface RuleCheck {
  rule: 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'CONTRACT'
  passed: boolean
  detail: string
}

// Equivalente al "MCP Activity" de Banorte One: cada paso que dio el agente.
export interface TraceEntry {
  step: string
  detail: string
  timestamp: string
}
