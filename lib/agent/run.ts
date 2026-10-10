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
  // Los casos se evaluan en paralelo (hasta 4 a la vez) para no esperar las
  // llamadas a la IA una por una.
  const queue = [...caseIds]
  const worker = async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      try {
        out[id] = await evaluateCase(id, store.events(id), now)
      } catch (error) {
        // Un caso que falla no detiene a los demas.
        console.error(`[agent] error evaluando ${id}:`, error)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker))
  // Se registran en el orden original para que el resultado sea repetible.
  const ordered: Record<string, DecisionRecord> = {}
  for (const id of caseIds) {
    if (!out[id]) continue
    store.recordDecision(id, out[id])
    ordered[id] = out[id]
  }
  return ordered
}

export function exportDecisions(store: CaseStore) {
  return store
    .caseIds()
    .map((id) => store.currentDecision(id)?.recommendation)
    .filter(Boolean)
}
