// Regresion contra el kit oficial de participantes (data/kit). No codifica
// respuestas por case_id en el agente: solo verifica el comportamiento
// esperado que describen README_KIT.txt y ejemplo_salida.json.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { CaseStore } from '@/lib/store/memory-store'
import { evaluateCases, exportDecisions } from '@/lib/agent/run'
import { manifestEvaluationTime } from '@/lib/events/types'
import { CONTACT_ACTIONS, type Recommendation } from '@/lib/decisions/types'

process.env.AGENT_MODE = 'fallback'
const KIT = 'data/kit'
const hasKit = fs.existsSync(`${KIT}/events.jsonl`)

async function loadKit(withUpdates: boolean) {
  const store = new CaseStore()
  store.evaluationTime = manifestEvaluationTime(JSON.parse(fs.readFileSync(`${KIT}/manifest.json`, 'utf8')))
  const ingest = store.ingestJsonl(fs.readFileSync(`${KIT}/events.jsonl`, 'utf8'))
  const records = await evaluateCases(store)
  if (withUpdates) {
    const upd = store.ingestJsonl(fs.readFileSync(`${KIT}/updates.jsonl`, 'utf8'))
    Object.assign(records, await evaluateCases(store, upd.affectedCaseIds))
  }
  const byId = Object.fromEntries((exportDecisions(store) as Recommendation[]).map((r) => [r.case_id, r]))
  return { store, ingest, records, byId }
}

test('kit: usa evaluation_at del manifest e ignora el duplicado de P02', { skip: !hasKit }, async () => {
  const { store, ingest } = await loadKit(false)
  assert.equal(store.evaluationTime, '2026-10-09T16:00:00Z')
  assert.deepEqual(ingest.duplicates.map((d) => d.event_id), ['P02-e2'])
  assert.equal(store.events('P02').length, 2)
})

test('kit: ninguna recomendacion viola R1-R4 ni el contrato', { skip: !hasKit }, async () => {
  const { records } = await loadKit(true)
  for (const [id, r] of Object.entries(records)) {
    const hard = r.rule_checks.filter((c) => !c.passed)
    assert.deepEqual(hard, [], `${id}: ${JSON.stringify(hard)}`)
  }
})

test('kit: P03 coincide con ejemplo_salida.json', { skip: !hasKit }, async () => {
  const { byId } = await loadKit(false)
  const expected = JSON.parse(fs.readFileSync(`${KIT}/ejemplo_salida.json`, 'utf8'))[0]
  const got = byId.P03
  for (const k of ['action', 'timing', 'scheduled_for', 'confidence', 'risk_level', 'requires_human_review', 'missing_information']) {
    assert.deepEqual(got[k as keyof Recommendation], expected[k], k)
  }
  assert.deepEqual([...got.evidence_event_ids].sort(), [...expected.evidence_event_ids].sort())
})

test('kit: caso cerrado (P05) -> no_action; contacto bloqueado (P04) sin acciones de contacto', { skip: !hasKit }, async () => {
  const { byId } = await loadKit(false)
  assert.equal(byId.P05.action, 'no_action')
  assert.ok(!CONTACT_ACTIONS.includes(byId.P04.action))
})

test('kit: P06 cambia tras la pregunta nueva de updates.jsonl', { skip: !hasKit }, async () => {
  const before = (await loadKit(false)).byId.P06
  const after = (await loadKit(true)).byId.P06
  assert.equal(before.action, 'wait') // R4: contacto hace 2h
  assert.notEqual(after.action, before.action)
  assert.ok(after.evidence_event_ids.includes('P06-e3'))
})
