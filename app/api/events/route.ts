import fs from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { store } from '@/lib/store/memory-store'
import { evaluateCases } from '@/lib/agent/run'

// Carga de eventos JSONL (archivo, formulario o este endpoint; seccion 2).
// Body: { jsonl?: string, manifest?: object, sample?: 'base' | 'update', evaluate?: boolean }
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body JSON invalido' }, { status: 400 })

  let jsonl: string = typeof body.jsonl === 'string' ? body.jsonl : ''
  let manifest = body.manifest ?? null

  if (body.sample === 'base' || body.sample === 'update') {
    const dir = path.join(process.cwd(), 'data', 'sample')
    jsonl = fs.readFileSync(path.join(dir, body.sample === 'base' ? 'events.jsonl' : 'events-update.jsonl'), 'utf8')
    if (body.sample === 'base') manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
  }

  if (manifest && typeof manifest === 'object') {
    const t = manifest.evaluation_time ?? manifest.evaluated_at ?? manifest.now
    if (typeof t === 'string') store.evaluationTime = t
  }
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
