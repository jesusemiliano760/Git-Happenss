import { NextResponse } from 'next/server'
import { store } from '@/lib/store/memory-store'
import { exportDecisions } from '@/lib/agent/run'

export const dynamic = 'force-dynamic'

// Exporta las recomendaciones vigentes conforme al contrato (seccion 6).
export async function GET() {
  return new NextResponse(JSON.stringify(exportDecisions(store), null, 2), {
    headers: {
      'content-type': 'application/json',
      'content-disposition': 'attachment; filename="decisions.json"',
    },
  })
}
