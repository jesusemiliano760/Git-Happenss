import { NextResponse } from 'next/server'
import { store } from '@/lib/store/memory-store'

export async function POST() {
  store.reset()
  return NextResponse.json({ ok: true })
}
