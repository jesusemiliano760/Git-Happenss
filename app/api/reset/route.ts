import { NextResponse } from 'next/server'
import { getStore, resetAll, saveEvaluation, saveIngest } from '@/lib/store/server'
import { evaluateCases } from '@/lib/agent/run'
import { manifestEvaluationTime } from '@/lib/events/types'
import { readPreset } from '@/lib/events/presets'

// Boton "Reiniciar": copia al historial, borra y carga el kit oficial.
export async function POST() {
  const { archivedAs } = await resetAll()
  const store = await getStore()
  const kit = readPreset('kit')!
  const t = manifestEvaluationTime(kit.manifest)
  if (t) store.evaluationTime = t
  const result = store.ingestJsonl(kit.jsonl)
  await saveIngest(store, result)
  const evaluated = await evaluateCases(store, result.affectedCaseIds)
  await saveEvaluation(evaluated)
  return NextResponse.json({ ok: true, archivedAs, accepted: result.accepted.length, evaluatedCaseIds: Object.keys(evaluated) })
}
