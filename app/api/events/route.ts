import { NextResponse } from 'next/server'
import { getStore, saveEvaluation, saveIngest } from '@/lib/store/server'
import { evaluateCases } from '@/lib/agent/run'
import { manifestEvaluationTime } from '@/lib/events/types'
import { readPreset } from '@/lib/events/presets'

// Carga de eventos JSONL (archivo, formulario o este endpoint; seccion 2).
// Body: { jsonl?: string, manifest?: object, sample?: 'kit' | 'kit-update' | 'base' | 'update', evaluate?: boolean }
export async function POST(request: Request) {
  const store = await getStore()
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body JSON invalido' }, { status: 400 })

  let jsonl: string = typeof body.jsonl === 'string' ? body.jsonl : ''
  let manifest = body.manifest ?? null

  const preset = readPreset(body.sample)
  if (preset) {
    jsonl = preset.jsonl
    if (preset.manifest) manifest = preset.manifest
  }

  const t = manifestEvaluationTime(manifest)
  if (t) store.evaluationTime = t
  if (!jsonl.trim()) return NextResponse.json({ error: 'No se recibieron eventos' }, { status: 400 })

  const result = store.ingestJsonl(jsonl)
  await saveIngest(store, result)
  const evaluated = body.evaluate === false ? {} : await evaluateCases(store, result.affectedCaseIds)
  await saveEvaluation(evaluated)

  return NextResponse.json({
    accepted: result.accepted.length,
    duplicates: result.duplicates,
    errors: result.errors,
    affectedCaseIds: result.affectedCaseIds,
    evaluatedCaseIds: Object.keys(evaluated),
    evaluationTime: store.evaluationTime,
  })
}
