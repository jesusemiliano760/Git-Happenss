'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Terminal } from 'lucide-react'
import type { TraceEntry } from '@/lib/decisions/types'

// Adaptado de components/financial/mcp-activity-panel.tsx (Banorte One):
// muestra al jurado cada paso que dio el agente para llegar a la decision.
export function TracePanel({ entries }: { entries: TraceEntry[] }) {
  const [open, setOpen] = useState(false)
  if (entries.length === 0) return null

  return (
    <div className="trace-panel">
      <button type="button" className="trace-toggle" onClick={() => setOpen((v) => !v)}>
        <Terminal aria-hidden="true" />
        Traza del agente ({entries.length} pasos)
        <span style={{ marginLeft: 'auto' }}>{open ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}</span>
      </button>
      {open && (
        <ul className="trace-list">
          {entries.map((entry, i) => (
            <li key={`${entry.step}-${i}`}>
              <strong>{entry.step}</strong>
              <span>{entry.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
