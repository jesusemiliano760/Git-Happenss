// Puntos de enganche entre las rutas de API y la persistencia. Las rutas solo
// llaman a estas funciones; si Supabase no esta configurado, no hacen nada.
import { store } from './memory-store'
import { interpCache } from '@/lib/agent/agent'
import type { IngestResult } from '@/lib/events/types'
import type { DecisionRecord } from '@/lib/decisions/types'
import {
  clearSupabase,
  ensureHydrated,
  persistDecisions,
  persistErrors,
  persistEvaluationTime,
  persistEvents,
  persistInterpretations,
} from './supabase-sync'

export { store }

export function ready() {
  return ensureHydrated(store, interpCache)
}

export async function saveIngest(result: IngestResult) {
  await persistEvaluationTime(store.evaluationTime)
  await persistEvents(result.accepted) // antes que interpretaciones (llave foranea)
  await persistErrors(result.errors)
}

export async function saveEvaluation(records: Record<string, DecisionRecord>) {
  await persistInterpretations(interpCache)
  await persistDecisions(records)
}

export async function resetAll() {
  store.reset()
  interpCache.clear()
  await clearSupabase()
}
