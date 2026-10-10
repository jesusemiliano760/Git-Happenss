import { evaluateCase } from './agent'
import type { CaseStore } from '@/lib/store/memory-store'
import type { DecisionRecord } from '@/lib/decisions/types'

// Hora de evaluacion: manifest.json del kit. Si no se cargo, se usa el
// evento mas reciente (nunca el reloj real) para que sea repetible.
export function resolveEvaluationTime(store: CaseStore): string {
  if (store.evaluationTime) return store.evaluationTime
  let max = 0
  for (const id of store.caseIds()) for (const e of store.events(id)) max = Math.max(max, Date.parse(e.occurred_at))
  return new Date(max || Date.now()).toISOString()
}

export async function evaluateCases(store: CaseStore, caseIds = store.caseIds()): Promise<Record<string, DecisionRecord>> {
  const now = resolveEvaluationTime(store)
  const out: Record<string, DecisionRecord> = {}
  for (const id of caseIds) {
    try {
      const record = await evaluateCase(id, store.events(id), now)
      store.recordDecision(id, record)
      out[id] = record
    } catch (error) {
      // Un caso que falla no detiene a los demas.
      console.error(`[agent] error evaluando ${id}:`, error)
    }
  }
  return out
}

export function exportDecisions(store: CaseStore) {
  return store
    .caseIds()
    .map((id) => store.currentDecision(id)?.recommendation)
    .filter(Boolean)
}
