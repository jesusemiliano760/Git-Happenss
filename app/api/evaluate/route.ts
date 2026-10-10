import { NextResponse } from 'next/server'
import { store } from '@/lib/store/memory-store'
import { evaluateCases } from '@/lib/agent/run'

// Boton "Evaluar": reevalua todos los casos (o los indicados) y conserva la
// decision anterior para mostrar que cambio.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const ids: string[] | undefined = Array.isArray(body?.caseIds) ? body.caseIds : undefined
  const records = await evaluateCases(store, ids)
  return NextResponse.json({ evaluated: Object.keys(records) })
}
