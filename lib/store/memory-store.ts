import type { CaseEvent, EventValidationError, IngestResult } from '@/lib/events/types'
import { parseJsonl } from '@/lib/events/parse'
import type { DecisionRecord } from '@/lib/decisions/types'

// Almacen en memoria (el PDF permite memoria o BD). Misma idea que el
// SavedViewsRepository de Banorte One: el resto de la app solo conoce esta
// clase, asi que cambiarla por SQLite/Supabase no toca el agente.
export class CaseStore {
  private seen = new Set<string>()
  private byCase = new Map<string, CaseEvent[]>()
  private decisions = new Map<string, DecisionRecord[]>() // historial, la ultima es la vigente
  private errors: EventValidationError[] = []
  evaluationTime: string | null = null

  ingestJsonl(text: string): IngestResult {
    const { events, errors } = parseJsonl(text)
    this.errors.push(...errors)
    return this.ingestEvents(events, errors)
  }

  ingestEvents(events: CaseEvent[], errors: EventValidationError[] = []): IngestResult {
    const accepted: CaseEvent[] = []
    const duplicates: IngestResult['duplicates'] = []
    const affected = new Set<string>()
    events.forEach((ev, i) => {
      // Deduplicacion global por event_id (seccion 2 del PDF).
      if (this.seen.has(ev.event_id)) {
        duplicates.push({ line: i + 1, event_id: ev.event_id })
        return
      }
      this.seen.add(ev.event_id)
      const list = this.byCase.get(ev.case_id) ?? []
      list.push(ev)
      // El kit viene ordenado, pero ordenamos de todas formas por si se
      // cargan archivos en distinto orden.
      list.sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at))
      this.byCase.set(ev.case_id, list)
      accepted.push(ev)
      affected.add(ev.case_id)
    })
    return { accepted, duplicates, errors, affectedCaseIds: [...affected] }
  }

  caseIds(): string[] {
    return [...this.byCase.keys()].sort()
  }

  events(caseId: string): CaseEvent[] {
    return this.byCase.get(caseId) ?? []
  }

  recordDecision(caseId: string, record: DecisionRecord) {
    const list = this.decisions.get(caseId) ?? []
    list.push(record)
    this.decisions.set(caseId, list)
  }

  currentDecision(caseId: string): DecisionRecord | null {
    const list = this.decisions.get(caseId)
    return list?.[list.length - 1] ?? null
  }

  previousDecision(caseId: string): DecisionRecord | null {
    const list = this.decisions.get(caseId)
    return list && list.length > 1 ? list[list.length - 2] : null
  }

  decisionHistory(caseId: string): DecisionRecord[] {
    return this.decisions.get(caseId) ?? []
  }

  validationErrors(): EventValidationError[] {
    return this.errors
  }

  // Usado al recuperar los errores guardados en Supabase.
  restoreErrors(errors: EventValidationError[]) {
    this.errors.push(...errors)
  }

  reset() {
    this.seen.clear()
    this.byCase.clear()
    this.decisions.clear()
    this.errors = []
    this.evaluationTime = null
  }
}

// Singleton por proceso de Next.js (sobrevive hot-reload en dev).
const g = globalThis as unknown as { __caseStore?: CaseStore }
export const store: CaseStore = g.__caseStore ?? (g.__caseStore = new CaseStore())
