// Puntos de enganche entre las rutas de API y la persistencia.
// - Sin Supabase: todas las peticiones comparten el CaseStore en memoria.
// - Con Supabase: cada peticion recibe un CaseStore armado desde la BD
//   (funciona aunque Vercel corra varias copias del servidor) y lo nuevo se
//   escribe de regreso. Si Supabase falla, se usa la memoria local.
import { store as memoryStore, type CaseStore } from './memory-store'
import { interpCache } from '@/lib/agent/agent'
import type { IngestResult } from '@/lib/events/types'
import type { DecisionRecord } from '@/lib/decisions/types'
import {
  clearSupabase,
  loadStoreFromSupabase,
  persistDecisions,
  persistErrors,
  persistEvaluationTime,
  persistEvents,
  persistInterpretations,
  supabaseEnabled,
} from './supabase-sync'

export async function getStore(): Promise<CaseStore> {
  if (!supabaseEnabled()) return memoryStore
  return (await loadStoreFromSupabase(interpCache)) ?? memoryStore
}

export async function saveIngest(store: CaseStore, result: IngestResult) {
  await persistEvaluationTime(store.evaluationTime)
  await persistEvents(result.accepted) // antes que interpretaciones (llave foranea)
  await persistErrors(result.errors)
}

export async function saveEvaluation(records: Record<string, DecisionRecord>) {
  await persistInterpretations(interpCache)
  await persistDecisions(records)
}

export async function resetAll() {
  memoryStore.reset()
  interpCache.clear()
  await clearSupabase()
}
