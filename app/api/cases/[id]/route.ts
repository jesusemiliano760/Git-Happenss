import { NextResponse } from 'next/server'
import { getStore } from '@/lib/store/server'
import { diffDecisions } from '@/lib/agent/agent'
import { buildContext } from '@/lib/agent/context'
import { resolveEvaluationTime } from '@/lib/agent/run'
import { buildAnalysis } from '@/lib/agent/analysis'
import { interpCache } from '@/lib/agent/agent'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const store = await getStore()
  const { id } = await params
  const events = store.events(id)
  if (!events.length) return NextResponse.json({ error: 'Caso no encontrado' }, { status: 404 })
  const current = store.currentDecision(id)
  const previous = store.previousDecision(id)
  const ctx = buildContext(id, events, resolveEvaluationTime(store))
  return NextResponse.json({
    case_id: id,
    events,
    metrics: ctx.metrics,
    analysis: buildAnalysis(ctx, interpCache, current?.recommendation ?? null),
    current,
    previous,
    diff: current ? diffDecisions(previous?.recommendation ?? null, current.recommendation) : [],
    history: store.decisionHistory(id).map((d) => ({ evaluated_at: d.evaluated_at, event_count: d.event_count, action: d.recommendation.action, timing: d.recommendation.timing })),
  })
}
