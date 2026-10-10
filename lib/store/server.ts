// Puntos de enganche entre las rutas de API y la persistencia.
// - Sin Supabase: todas las peticiones comparten el CaseStore en memoria.
// - Con Supabase: cada peticion recibe un CaseStore armado desde la BD
//   (funciona aunque Vercel corra varias copias del servidor) y lo nuevo se
//   escribe de regreso. Si Supabase falla, se usa la memoria local.
import { store as memoryStore, type CaseStore } from './memory-store'
import { interpCache } from '@/lib/agent/agent'
import type { IngestResult } from '@/lib/events/types'
import type { DecisionRecord } from '@/lib/decisions/types'
import { readPreset } from '@/lib/events/presets'
import {
  archiveSupabase,
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

// Boton "Reiniciar": guarda una copia en el historial de Supabase, borra todo
// y vuelve a cargar el kit oficial. Las interpretaciones de los mensajes del
// kit se conservan (son siempre los mismos) para no gastar llamadas a la IA.
export async function resetAll() {
  const archivedAs = await archiveSupabase()
  const kit = readPreset('kit')!
  const kitIds = new Set(kit.jsonl.split('\n').flatMap((line) => {
    try {
      return [JSON.parse(line).event_id as string]
    } catch {
      return []
    }
  }))
  memoryStore.reset()
  for (const id of [...interpCache.keys()]) if (!kitIds.has(id)) interpCache.delete(id)
  await clearSupabase()
  return { archivedAs }
}
