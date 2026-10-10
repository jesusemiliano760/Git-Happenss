import { NextResponse } from 'next/server'
import { ready, resetAll } from '@/lib/store/server'

export async function POST() {
  await ready()
  await resetAll()
  return NextResponse.json({ ok: true })
}
