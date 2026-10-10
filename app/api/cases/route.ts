import { NextResponse } from 'next/server'
import { ready, store } from '@/lib/store/server'
import { storageStatus } from '@/lib/store/supabase-sync'
import { resolveEvaluationTime } from '@/lib/agent/run'
import { activeProvider } from '@/lib/agent/interpreter'

export const dynamic = 'force-dynamic'

export async function GET() {
  await ready()
  const cases = store.caseIds().map((id) => {
    const current = store.currentDecision(id)
    const events = store.events(id)
    return {
      case_id: id,
      event_count: events.length,
      last_event_at: events[events.length - 1]?.occurred_at ?? null,
      decision: current?.recommendation ?? null,
      stale: Boolean(current && current.event_count !== events.filter((e) => Date.parse(e.occurred_at) <= Date.parse(current.evaluated_at)).length),
      changed: Boolean(store.previousDecision(id)),
    }
  })
  return NextResponse.json({
    cases,
    errors: store.validationErrors(),
    evaluationTime: store.caseIds().length ? resolveEvaluationTime(store) : store.evaluationTime,
    mode: activeProvider() ? 'live' : 'fallback',
    provider: activeProvider(),
    storage: storageStatus(),
  })
}
