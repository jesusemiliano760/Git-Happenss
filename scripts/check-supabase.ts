// Prueba la conexion con Supabase: npm run check:db
import { pingSupabase } from '@/lib/store/supabase-sync'

pingSupabase().then(({ ok, detail }) => {
  console.log(ok ? `OK: ${detail}` : `ERROR: ${detail}`)
  process.exit(ok ? 0 : 1)
})
