'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CaseEvent, EventValidationError } from '@/lib/events/types'
import type { DecisionRecord, Recommendation } from '@/lib/decisions/types'
import type { EngagementMetrics } from '@/lib/agent/context'
import { TracePanel } from './trace-panel'

interface CaseSummary {
  case_id: string
  event_count: number
  last_event_at: string | null
  decision: Recommendation | null
  stale: boolean
  changed: boolean
}

interface CasesResponse {
  cases: CaseSummary[]
  errors: EventValidationError[]
  evaluationTime: string | null
  mode: 'live' | 'fallback'
  provider: 'gemini' | 'claude' | null
  storage: { backend: 'supabase' | 'memoria'; lastError: string | null }
}

interface CaseDetail {
  case_id: string
  events: CaseEvent[]
  metrics: EngagementMetrics
  current: DecisionRecord | null
  previous: DecisionRecord | null
  diff: { field: string; before: unknown; after: unknown }[]
  analysis: { facts: string[]; inferences: string[]; missing: string[] }
}

const ACTION_LABEL: Record<string, string> = {
  contact: 'Contactar',
  request_information: 'Pedir información',
  resolve_objection: 'Resolver objeción',
  escalate: 'Escalar a una persona',
  wait: 'Esperar',
  no_action: 'No actuar',
}

const fmt = (iso: string | null | undefined) => (iso ? iso.replace('T', ' ').replace(/:\d\d(\.\d+)?Z$/, 'Z') : '—')

export function Dashboard() {
  const [data, setData] = useState<CasesResponse | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<CaseDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [paste, setPaste] = useState('')
  const [liveCase, setLiveCase] = useState('')
  const [liveText, setLiveText] = useState('')

  const refresh = useCallback(async () => {
    const res: CasesResponse = await fetch('/api/cases').then((r) => r.json())
    setData(res)
    setSelected((cur) => cur ?? res.cases[0]?.case_id ?? null)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!selected) return setDetail(null)
    fetch(`/api/cases/${encodeURIComponent(selected)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setDetail)
  }, [selected, data])

  async function post(url: string, body: unknown, message?: (r: any) => string) {
    setBusy(true)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) setToast(json.error ?? 'Error')
      else if (message) setToast(message(json))
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const ingestMsg = (r: any) =>
    `${r.accepted} eventos aceptados, ${r.duplicates.length} duplicados ignorados, ${r.errors.length} con error. Reevaluados: ${r.evaluatedCaseIds.join(', ') || 'ninguno'}.`

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    let jsonl = ''
    let manifest: unknown = null
    for (const f of Array.from(files)) {
      const text = await f.text()
      if (f.name.endsWith('.json')) manifest = JSON.parse(text)
      else jsonl += text + '\n'
    }
    await post('/api/events', { jsonl, manifest }, ingestMsg)
  }

  // Simula al cliente escribiendo en vivo: el texto normal se convierte en un
  // evento message.received del caso elegido (con la hora de evaluacion para
  // que no quede "en el futuro") y se manda por la misma ruta que el JSONL.
  async function sendLiveMessage() {
    const caseId = (liveCase || selected || '').trim()
    if (!caseId || !liveText.trim()) return
    const event = {
      event_id: `vivo-${Date.now()}`,
      case_id: caseId,
      event_type: 'message.received',
      occurred_at: data?.evaluationTime ?? new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
      data: { message: liveText.trim() },
    }
    await post('/api/events', { jsonl: JSON.stringify(event) }, ingestMsg)
    setLiveText('')
    setSelected(caseId)
  }

  const rec = detail?.current?.recommendation
  const evidence = new Set(rec?.evidence_event_ids ?? [])

  return (
    <main>
      <header className="app-header">
        <div>
          <h1>Git Happens · What Should Happen Next?</h1>
          <div className="sub">
            Hora de evaluación: {fmt(data?.evaluationTime)} · <span className="mode-pill">IA: {data?.provider === 'gemini' ? 'Gemini (live)' : data?.provider === 'claude' ? 'Claude (live)' : 'heuristica (fallback)'}</span> <span className="mode-pill" title={data?.storage.lastError ?? ''}>BD: {data?.storage.backend ?? '—'}{data?.storage.lastError ? ' (error)' : ''}</span>
          </div>
        </div>
        <div className="toolbar">
          <button className="btn" disabled={busy} onClick={() => post('/api/events', { sample: 'kit' }, ingestMsg)}>
            Cargar kit oficial
          </button>
          <button className="btn" disabled={busy} onClick={() => post('/api/events', { sample: 'kit-update' }, ingestMsg)}>
            + updates.jsonl
          </button>
          <button className="btn" disabled={busy} onClick={() => post('/api/events', { sample: 'base' }, ingestMsg)} title="Datos inventados por el equipo">
            Ejemplo extra
          </button>
          <button className="btn" disabled={busy} onClick={() => post('/api/events', { sample: 'update' }, ingestMsg)}>
            + eventos extra
          </button>
          <button className="btn primary" disabled={busy} onClick={() => post('/api/evaluate', {}, (r) => `Reevaluados ${r.evaluated.length} casos.`)}>
            Evaluar
          </button>
          <a className="btn" href="/api/export" download>
            Exportar JSON
          </a>
          <button className="btn" disabled={busy} onClick={() => post('/api/reset', {}, (r) => `${r.archivedAs ? 'Copia guardada en el historial de Supabase. ' : ''}Datos borrados y kit oficial cargado (${r.evaluatedCaseIds.length} casos).`).then(() => setSelected(null))}>
            Reiniciar
          </button>
        </div>
      </header>
      {toast && <div className="toast">{toast}</div>}

      <div className="layout">
        <aside className="panel" style={{ alignSelf: 'start' }}>
          <h2 className="panel-title">Casos ({data?.cases.length ?? 0})</h2>
          {data?.cases.length ? (
            <ul className="case-list">
              {data.cases.map((c) => (
                <li key={c.case_id}>
                  <button className={`case-item ${selected === c.case_id ? 'active' : ''}`} onClick={() => setSelected(c.case_id)}>
                    <div className="row">
                      <span className="id">{c.case_id}</span>
                      {c.decision && <span className={`badge ${c.decision.action}`}>{ACTION_LABEL[c.decision.action]}</span>}
                    </div>
                    <div className="row meta">
                      <span>{c.event_count} eventos</span>
                      {c.changed && <span className="badge changed">reevaluado</span>}
                      {c.stale && <span className="badge level-medium">pendiente</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">Sin casos. Carga un events.jsonl o el ejemplo.</p>
          )}
          <div className="upload">
            <label>Mensaje del cliente (texto normal)</label>
            <select value={liveCase || selected || ''} onChange={(e) => setLiveCase(e.target.value)}>
              {(data?.cases ?? []).map((c) => (
                <option key={c.case_id} value={c.case_id}>
                  {c.case_id}
                </option>
              ))}
            </select>
            <textarea className="plain" value={liveText} onChange={(e) => setLiveText(e.target.value)} placeholder="Ej.: ¿Tienen descuento si pago de contado?" />
            <button className="btn" disabled={busy || !liveText.trim() || !(liveCase || selected)} onClick={sendLiveMessage}>
              Enviar mensaje
            </button>
            <label>Cargar archivos (events.jsonl y manifest.json)</label>
            <input type="file" multiple accept=".jsonl,.json,.txt" onChange={(e) => onFiles(e.target.files)} />
            <label>O pega líneas JSONL</label>
            <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder='{"event_id":"...","case_id":"...", ...}' />
            <button className="btn" disabled={busy || !paste.trim()} onClick={() => post('/api/events', { jsonl: paste }, ingestMsg).then(() => setPaste(''))}>
              Agregar eventos
            </button>
          </div>
          {data?.errors.length ? (
            <>
              <h2 className="panel-title">Errores de formato ({data.errors.length})</h2>
              <ul className="errors" style={{ paddingTop: 10 }}>
                {data.errors.map((e, i) => (
                  <li key={i}>
                    Linea {e.line}
                    {e.case_id ? ` (${e.case_id})` : ''}: {e.error}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </aside>

        <section className="detail">
          {!detail ? (
            <div className="panel empty">Selecciona un caso.</div>
          ) : (
            <>
              {rec ? (
                <div className="panel rec-card">
                  <div className="rec-head">
                    <span className="rec-action">{ACTION_LABEL[rec.action]}</span>
                    <span className={`badge ${rec.action}`}>{rec.action}</span>
                    <span className={`badge level-${rec.confidence}`}>confianza {rec.confidence}</span>
                    <span className={`badge level-${rec.risk_level}`}>riesgo {rec.risk_level}</span>
                    {rec.requires_human_review && <span className="badge escalate">requiere revisión humana</span>}
                  </div>
                  <p className="rec-reason">{rec.reason}</p>
                  <div className="kv">
                    <div>
                      <span>Momento</span>
                      <strong>{rec.timing}</strong>
                    </div>
                    <div>
                      <span>Programado para</span>
                      <strong>{fmt(rec.scheduled_for)}</strong>
                    </div>
                    <div>
                      <span>Modo IA</span>
                      <strong>{detail.current?.mode}</strong>
                    </div>
                    <div>
                      <span>Evidencia</span>
                      <strong>{rec.evidence_event_ids.length} eventos</strong>
                    </div>
                  </div>
                  <p className="muted">
                    <b>Por qué esta confianza:</b> {rec.confidence_reason}
                  </p>
                  <div className="analysis">
                    <div>
                      <b>Hechos observados</b>
                      <ul>{detail.analysis.facts.length ? detail.analysis.facts.map((f) => <li key={f}>{f}</li>) : <li>—</li>}</ul>
                    </div>
                    <div>
                      <b>Inferencias</b>
                      <ul>{detail.analysis.inferences.length ? detail.analysis.inferences.map((f) => <li key={f}>{f}</li>) : <li>Sin mensajes que interpretar.</li>}</ul>
                    </div>
                    <div>
                      <b>Información faltante</b>
                      <ul>{detail.analysis.missing.length ? detail.analysis.missing.map((f) => <li key={f}>{f}</li>) : <li>Nada esencial.</li>}</ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="panel empty">Caso sin evaluar. Presiona “Evaluar”.</div>
              )}

              {detail.diff.length > 0 && (
                <div className="panel section">
                  <h3>Qué cambió respecto a la decisión anterior</h3>
                  <ul className="diff">
                    {detail.diff.map((d) => (
                      <li key={d.field}>
                        <b>{d.field}:</b> <s>{String(d.before)}</s> → {String(d.after)}
                      </li>
                    ))}
                  </ul>
                  {detail.previous && <p className="muted">Anterior: {detail.previous.recommendation.reason}</p>}
                </div>
              )}

              {detail.current && (
                <div className="panel section">
                  <h3>Validación determinística de reglas</h3>
                  <ul className="rules">
                    {detail.current.rule_checks.map((c) => (
                      <li key={c.rule}>
                        <span className={c.passed ? 'ok' : 'ko'}>{c.passed ? '✓' : '✗'}</span>
                        <span>
                          <b>{c.rule}</b> {c.detail}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <TracePanel entries={detail.current.trace} />
                </div>
              )}

              <div className="panel section">
                <h3>Métricas entre acciones</h3>
                <div className="kv">
                  <div><span>Aperturas</span><strong>{detail.metrics.view_count}</strong></div>
                  <div><span>Min. a 1a apertura</span><strong>{detail.metrics.minutes_to_first_view ?? '—'}</strong></div>
                  <div><span>Aperturas 24h</span><strong>{detail.metrics.views_last_24h}</strong></div>
                  <div><span>Hrs a 1a respuesta</span><strong>{detail.metrics.hours_to_first_reply ?? '—'}</strong></div>
                  <div><span>Hrs desde ult. contacto</span><strong>{detail.metrics.hours_since_last_contact ?? '—'}</strong></div>
                  <div><span>Hrs sin actividad</span><strong>{detail.metrics.hours_since_last_activity ?? '—'}</strong></div>
                  <div><span>Secciones vistas</span><strong>{detail.metrics.sections_viewed.join(', ') || '—'}</strong></div>
                </div>
              </div>

              <div className="panel">
                <h2 className="panel-title">Historial ({detail.events.length} eventos) — resaltada la evidencia</h2>
                <ul className="timeline">
                  {detail.events.map((e) => (
                    <li key={e.event_id} className={evidence.has(e.event_id) ? 'evidence' : ''}>
                      <span className="when">{fmt(e.occurred_at)}</span>
                      <span className="type">{e.event_type}</span>
                      <span>
                        <span className="chip">{e.event_id}</span>{' '}
                        {e.event_type === 'message.received' ? `“${String(e.data.message)}”` : Object.keys(e.data).length ? JSON.stringify(e.data) : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
