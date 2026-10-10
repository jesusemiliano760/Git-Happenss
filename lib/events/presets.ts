import fs from 'node:fs'
import path from 'node:path'

// Atajos para la demo: kit oficial (data/kit) o datos de ejemplo del equipo.
const PRESETS: Record<string, { dir: string; file: string; withManifest: boolean }> = {
  kit: { dir: 'kit', file: 'events.jsonl', withManifest: true },
  'kit-update': { dir: 'kit', file: 'updates.jsonl', withManifest: false },
  base: { dir: 'sample', file: 'events.jsonl', withManifest: true },
  update: { dir: 'sample', file: 'events-update.jsonl', withManifest: false },
}

export function readPreset(name: unknown): { jsonl: string; manifest: unknown } | null {
  const preset = typeof name === 'string' ? PRESETS[name] : undefined
  if (!preset) return null
  const dir = path.join(process.cwd(), 'data', preset.dir)
  return {
    jsonl: fs.readFileSync(path.join(dir, preset.file), 'utf8'),
    manifest: preset.withManifest ? JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) : null,
  }
}
