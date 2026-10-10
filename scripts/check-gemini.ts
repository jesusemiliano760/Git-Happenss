// Prueba rapida de la conexion con Gemini: npm run check:ia
// Lee GEMINI_API_KEY (y GEMINI_MODEL opcional) de .env.local o del entorno.
import { activeProvider, interpretLive } from '@/lib/agent/interpreter'

async function main() {
  const provider = activeProvider()
  if (!provider) {
    console.log('No hay GEMINI_API_KEY (ni ANTHROPIC_API_KEY). Agrega la llave a .env.local.')
    process.exit(1)
  }
  console.log(`Proveedor: ${provider} · modelo: ${provider === 'gemini' ? process.env.GEMINI_MODEL ?? 'gemini-3.8-flash' : process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5'}`)
  const ev = {
    event_id: 'check-1',
    case_id: 'CHECK',
    event_type: 'message.received' as const,
    occurred_at: '2026-10-09T15:00:00Z',
    data: { message: 'No me contacten antes del 12 de octubre a las 15:00 UTC.' },
  }
  try {
    const out = await interpretLive(ev, 'monto_mxn=150000')
    console.log(JSON.stringify(out, null, 2))
    console.log('\nOK: la IA respondio con el formato esperado.')
  } catch (e) {
    console.error('\nERROR al llamar a la IA:', (e as Error).message)
    console.error('Revisa la llave, el nombre del modelo (GEMINI_MODEL) y tu conexion.')
    process.exit(1)
  }
}

main()
