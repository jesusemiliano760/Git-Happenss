// Corre el agente sobre un kit sin levantar la UI y escribe el JSON de
// recomendaciones (entregable de la seccion 7).
//
//   npm run decide                                   -> data/kit (events + updates) si existe, si no data/sample
//   npm run decide -- data/kit/events.jsonl data/kit/manifest.json output/decisions.json
//   npm run decide -- data/sample/events.jsonl data/sample/manifest.json output/x.json data/sample/events-update.jsonl

import fs from 'node:fs'
import path from 'node:path'
import { CaseStore } from '@/lib/store/memory-store'
import { evaluateCases, exportDecisions } from '@/lib/agent/run'
import { diffDecisions } from '@/lib/agent/agent'
import { manifestEvaluationTime } from '@/lib/events/types'
import { activeProvider } from '@/lib/agent/interpreter'

const args = process.argv.slice(2)
const kitDir = fs.existsSync('data/kit/events.jsonl') ? 'data/kit' : 'data/sample'
const [eventsPath = `${kitDir}/events.jsonl`, manifestPath = `${kitDir}/manifest.json`, outPath = 'output/decisions.json', ...extra] = args
// Sin argumentos y con el kit oficial: tambien se aplica updates.jsonl.
const updates = args.length === 0 && fs.existsSync(`${kitDir}/updates.jsonl`) ? [`${kitDir}/updates.jsonl`] : extra

async function main() {
  const store = new CaseStore()
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    store.evaluationTime = manifestEvaluationTime(manifest)
  }
  const res = store.ingestJsonl(fs.readFileSync(eventsPath, 'utf8'))
  console.log(`Eventos: ${res.accepted.length} aceptados, ${res.duplicates.length} duplicados, ${res.errors.length} con error`)
  for (const e of res.errors) console.log(`  linea ${e.line}: ${e.error}`)
  console.log(`Hora de evaluacion: ${store.evaluationTime ?? '(sin manifest)'}`)
  console.log(`IA: ${activeProvider() ?? 'heuristica (sin llave)'}`)

  const first = await evaluateCases(store)
  printTable(first)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  if (updates.length) {
    // Foto antes de las actualizaciones, para la demo de "que cambio".
    const initialPath = outPath.replace(/\.json$/, '-inicial.json')
    fs.writeFileSync(initialPath, JSON.stringify(exportDecisions(store), null, 2) + '\n')
    console.log(`Escrito ${initialPath}`)
  }

  for (const upd of updates) {
    const r = store.ingestJsonl(fs.readFileSync(upd, 'utf8'))
    console.log(`\n== Nuevos eventos (${upd}): ${r.accepted.length} aceptados, ${r.duplicates.length} duplicados ==`)
    const again = await evaluateCases(store, r.affectedCaseIds)
    for (const [id, rec] of Object.entries(again)) {
      const prev = store.previousDecision(id)?.recommendation ?? null
      const diff = diffDecisions(prev, rec.recommendation)
      console.log(`${id}: ${diff.length ? diff.map((d) => `${d.field}: ${d.before} -> ${d.after}`).join(', ') : 'sin cambios'}`)
    }
  }

  fs.writeFileSync(outPath, JSON.stringify(exportDecisions(store), null, 2) + '\n')
  console.log(`\nEscrito ${outPath}`)
}

function printTable(records: Awaited<ReturnType<typeof evaluateCases>>) {
  for (const [id, r] of Object.entries(records)) {
    const rec = r.recommendation
    const failed = r.rule_checks.filter((c) => !c.passed).map((c) => c.rule)
    console.log(
      `${id.padEnd(10)} ${rec.action.padEnd(18)} ${rec.timing.padEnd(18)} ${(rec.scheduled_for ?? '').padEnd(24)} conf=${rec.confidence.padEnd(6)} riesgo=${rec.risk_level.padEnd(6)} humano=${rec.requires_human_review ? 'si' : 'no'}${failed.length ? ` WARN=${failed.join(',')}` : ''}`,
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
