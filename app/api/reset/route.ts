import { NextResponse } from 'next/server'
import { resetAll } from '@/lib/store/server'

export async function POST() {
  await resetAll()
  return NextResponse.json({ ok: true })
}
