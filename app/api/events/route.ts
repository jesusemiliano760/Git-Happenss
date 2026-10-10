import fs from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { store } from '@/lib/store/memory-store'
import { evaluateCases } from '@/lib/agent/run'
import { manifestEvaluationTime } from '@/lib/events/types'

// Carga de eventos JSONL (archivo, formulario o este endpoint; seccion 2).
// Body: { jsonl?: string, manifest?: object, sample?: 'kit' | 'kit-update' | 'base' | 'update', evaluate?: boolean }
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body JSON invalido' }, { status: 400 })

  let jsonl: string = typeof body.jsonl === 'string' ? body.jsonl : ''
  let manifest = body.manifest ?? null

  // Atajos para la demo: kit oficial (data/kit) o datos de ejemplo del equipo.
  const PRESETS: Record<string, { dir: string; file: string; withManifest: boolean }> = {
    kit: { dir: 'kit', file: 'events.jsonl', withManifest: true },
    'kit-update': { dir: 'kit', file: 'updates.jsonl', withManifest: false },
    base: { dir: 'sample', file: 'events.jsonl', withManifest: true },
    update: { dir: 'sample', file: 'events-update.jsonl', withManifest: false },
  }
  const preset = typeof body.sample === 'string' ? PRESETS[body.sample] : undefined
  if (preset) {
    const dir = path.join(process.cwd(), 'data', preset.dir)
    jsonl = fs.readFileSync(path.join(dir, preset.file), 'utf8')
    if (preset.withManifest) manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
  }

  const t = manifestEvaluationTime(manifest)
  if (t) store.evaluationTime = t
  if (!jsonl.trim()) return NextResponse.json({ error: 'No se recibieron eventos' }, { status: 400 })

  const result = store.ingestJsonl(jsonl)
  const evaluated = body.evaluate === false ? {} : await evaluateCases(store, result.affectedCaseIds)

  return NextResponse.json({
    accepted: result.accepted.length,
    duplicates: result.duplicates,
    errors: result.errors,
    affectedCaseIds: result.affectedCaseIds,
    evaluatedCaseIds: Object.keys(evaluated),
    evaluationTime: store.evaluationTime,
  })
}
