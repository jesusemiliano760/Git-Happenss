// Persistencia en Supabase (opcional). El agente sigue trabajando sobre el
// CaseStore en memoria; esta capa:
//   - al arrancar, carga eventos, interpretaciones y decisiones desde Supabase
//     (hydrate) para continuar donde se quedo;
//   - despues de cada carga/evaluacion, escribe lo nuevo.
// Ninguna funcion lanza errores: si Supabase falla o no esta configurado, la
// app sigue en memoria (misma filosofia que el FALLBACK de Banorte One).
//
// Solo corre en el servidor. La llave secreta NUNCA debe llevar prefijo
// NEXT_PUBLIC_ ni usarse en el navegador.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { CaseStore } from './memory-store'
import type { CaseEvent, EventValidationError } from '@/lib/events/types'
import type { DecisionRecord } from '@/lib/decisions/types'
import type { MessageInterpretation } from '@/lib/agent/interpreter'

// La URL va sin /rest/v1 (supabase-js lo agrega). Si alguien la copia con ese
// sufijo desde "Data API", se quita para no duplicar la ruta.
const URL = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '')
const KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const PAGE = 1000

let client: SupabaseClient | null = null
let lastError: string | null = null

export function supabaseEnabled(): boolean {
  return Boolean(URL && KEY)
}

function db(): SupabaseClient {
  client ??= createClient(URL!, KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  return client
}

export function storageStatus() {
  return { backend: supabaseEnabled() ? 'supabase' : 'memoria', lastError } as const
}

async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  if (!supabaseEnabled()) return null
  try {
    const out = await fn()
    lastError = null
    return out
  } catch (e) {
    lastError = `${label}: ${(e as Error).message}`
    console.warn('[supabase]', lastError)
    return null
  }
}

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

async function selectAll<T>(table: string, order: string): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const page = check(await db().from(table).select('*').order(order, { ascending: true }).range(from, from + PAGE - 1)) as T[]
    rows.push(...page)
    if (page.length < PAGE) return rows
  }
}

// --- Lectura al arrancar ----------------------------------------------------

const g = globalThis as unknown as { __supabaseHydrated?: Promise<void> }

export function ensureHydrated(store: CaseStore, interpCache: Map<string, MessageInterpretation>): Promise<void> {
  if (!supabaseEnabled()) return Promise.resolve()
  g.__supabaseHydrated ??= hydrate(store, interpCache)
  return g.__supabaseHydrated
}

async function hydrate(store: CaseStore, interpCache: Map<string, MessageInterpretation>) {
  await safe('hydrate', async () => {
    const [events, interps, decisions, errors, state] = await Promise.all([
      selectAll<CaseEvent & { ingested_at: string }>('events', 'occurred_at'),
      selectAll<{ event_id: string; interpretation: MessageInterpretation }>('interpretations', 'created_at'),
      selectAll<DecisionRow>('decisions', 'created_at'),
      selectAll<EventValidationError>('ingest_errors', 'id'),
      selectAll<{ key: string; value: unknown }>('app_state', 'key'),
    ])
    store.ingestEvents(
      events.map((e) => ({ event_id: e.event_id, case_id: e.case_id, event_type: e.event_type, occurred_at: e.occurred_at, data: e.data })),
    )
    for (const r of interps) {
      interpCache.set(r.event_id, r.interpretation)
      persistedInterps.add(r.event_id)
    }
    for (const d of decisions) store.recordDecision(d.case_id, rowToRecord(d))
    store.restoreErrors(errors.map((e) => ({ line: e.line, case_id: e.case_id ?? undefined, event_id: e.event_id ?? undefined, error: e.error, raw: e.raw })))
    const t = state.find((s) => s.key === 'evaluation_at')?.value
    if (typeof t === 'string') store.evaluationTime = t
    console.log(`[supabase] cargados ${events.length} eventos, ${decisions.length} decisiones`)
  })
}

// --- Escritura -------------------------------------------------------------

interface DecisionRow {
  case_id: string
  evaluated_at: string
  mode: DecisionRecord['mode']
  recommendation: DecisionRecord['recommendation']
  proposed: DecisionRecord['proposed']
  rule_checks: DecisionRecord['rule_checks']
  trace: DecisionRecord['trace']
  event_count: number
}

function rowToRecord(d: DecisionRow): DecisionRecord {
  return {
    recommendation: d.recommendation,
    evaluated_at: d.evaluated_at,
    mode: d.mode,
    proposed: d.proposed,
    rule_checks: d.rule_checks,
    trace: d.trace,
    event_count: d.event_count,
  }
}

export async function persistEvents(events: CaseEvent[]) {
  if (!events.length) return
  await safe('events', async () =>
    check(
      await db()
        .from('events')
        .upsert(
          events.map((e) => ({ event_id: e.event_id, case_id: e.case_id, event_type: e.event_type, occurred_at: e.occurred_at, data: e.data })),
          { onConflict: 'event_id', ignoreDuplicates: true },
        ),
    ),
  )
}

export async function persistErrors(errors: EventValidationError[]) {
  if (!errors.length) return
  await safe('ingest_errors', async () =>
    check(
      await db()
        .from('ingest_errors')
        .insert(errors.map((e) => ({ line: e.line, case_id: e.case_id ?? null, event_id: e.event_id ?? null, error: e.error, raw: e.raw }))),
    ),
  )
}

export async function persistEvaluationTime(t: string | null) {
  if (!t) return
  await safe('app_state', async () =>
    check(await db().from('app_state').upsert({ key: 'evaluation_at', value: t, updated_at: new Date().toISOString() })),
  )
}

const persistedInterps = new Set<string>()

export async function persistInterpretations(cache: Map<string, MessageInterpretation>) {
  const fresh = [...cache.values()].filter((i) => !persistedInterps.has(i.event_id))
  if (!fresh.length) return
  const ok = await safe('interpretations', async () =>
    check(
      await db()
        .from('interpretations')
        .upsert(
          fresh.map((i) => ({ event_id: i.event_id, source: i.source, intent: i.intent, interpretation: i })),
          { onConflict: 'event_id' },
        ),
    ),
  )
  if (ok !== null) fresh.forEach((i) => persistedInterps.add(i.event_id))
}

export async function persistDecisions(records: Record<string, DecisionRecord>) {
  const rows = Object.entries(records).map(([case_id, r]) => ({
    case_id,
    evaluated_at: r.evaluated_at,
    action: r.recommendation.action,
    timing: r.recommendation.timing,
    confidence: r.recommendation.confidence,
    risk_level: r.recommendation.risk_level,
    requires_human_review: r.recommendation.requires_human_review,
    mode: r.mode,
    recommendation: r.recommendation,
    proposed: r.proposed,
    rule_checks: r.rule_checks,
    trace: r.trace,
    event_count: r.event_count,
  }))
  if (!rows.length) return
  await safe('decisions', async () => check(await db().from('decisions').insert(rows)))
}

// Boton "Reiniciar": borra todo (en orden por la llave foranea).
export async function clearSupabase() {
  await safe('reset', async () => {
    for (const [table, col] of [
      ['interpretations', 'event_id'],
      ['decisions', 'case_id'],
      ['ingest_errors', 'line'],
      ['events', 'event_id'],
      ['app_state', 'key'],
    ] as const) {
      check(await db().from(table).delete().not(col, 'is', null))
    }
    persistedInterps.clear()
  })
}

// Prueba de conexion para `npm run check:db`.
export async function pingSupabase(): Promise<{ ok: boolean; detail: string }> {
  if (!supabaseEnabled()) return { ok: false, detail: 'Faltan SUPABASE_URL y/o SUPABASE_SECRET_KEY en .env.local' }
  const tables = ['events', 'interpretations', 'decisions', 'ingest_errors', 'app_state']
  for (const t of tables) {
    const { error, count } = await db().from(t).select('*', { count: 'exact', head: true })
    if (error) return { ok: false, detail: `Tabla ${t}: ${error.message} (¿corriste supabase/schema.sql?)` }
    console.log(`  ${t}: ${count ?? 0} filas`)
  }
  return { ok: true, detail: 'Conexion correcta y las 5 tablas existen.' }
}
