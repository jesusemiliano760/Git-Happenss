import { NextResponse } from 'next/server'
import { getStore, saveEvaluation } from '@/lib/store/server'
import { evaluateCases } from '@/lib/agent/run'

// Boton "Evaluar": reevalua todos los casos (o los indicados) y conserva la
// decision anterior para mostrar que cambio.
export async function POST(request: Request) {
  const store = await getStore()
  const body = await request.json().catch(() => ({}))
  const ids: string[] | undefined = Array.isArray(body?.caseIds) ? body.caseIds : undefined
  const records = await evaluateCases(store, ids)
  await saveEvaluation(records)
  return NextResponse.json({ evaluated: Object.keys(records) })
}
