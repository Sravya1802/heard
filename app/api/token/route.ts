// Mints a single-use Voice Agent token so the API key never reaches the browser.
// Also the cost guard for the public demo: sessions are capped in length and
// rate-limited per visitor and overall.

import type { NextRequest } from 'next/server'

const MAX_SESSION_SECONDS = Number(process.env.MAX_SESSION_SECONDS ?? 180)
const PER_IP_PER_HOUR = Number(process.env.SESSIONS_PER_IP_PER_HOUR ?? 8)
const GLOBAL_PER_HOUR = Number(process.env.SESSIONS_PER_HOUR ?? 120)
const HOUR = 60 * 60 * 1000

// Per server instance. Good enough to stop a runaway tab; not a billing system.
const byIp = new Map<string, number[]>()
let recent: number[] = []

function allow(ip: string): string | null {
  const now = Date.now()
  recent = recent.filter((t) => now - t < HOUR)
  const mine = (byIp.get(ip) ?? []).filter((t) => now - t < HOUR)
  if (recent.length >= GLOBAL_PER_HOUR) return 'The demo is very busy right now. Please try again in a few minutes, or watch a recorded order.'
  if (mine.length >= PER_IP_PER_HOUR) return 'You have reached the demo limit for this hour. Thanks for trying Heard! You can still watch a recorded order.'
  mine.push(now)
  recent.push(now)
  byIp.set(ip, mine)
  return null
}

export async function POST(request: NextRequest) {
  const key = process.env.ASSEMBLYAI_API_KEY
  if (!key) return Response.json({ error: 'The server has no AssemblyAI API key configured.' }, { status: 500 })
  if (process.env.DEMO_PAUSED === 'true') return Response.json({ error: 'The live demo is paused. You can still watch a recorded order.' }, { status: 503 })

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  const blocked = allow(ip)
  if (blocked) return Response.json({ error: blocked }, { status: 429 })

  const url = new URL('https://agents.assemblyai.com/v1/token')
  url.searchParams.set('expires_in_seconds', '60')
  url.searchParams.set('max_session_duration_seconds', String(MAX_SESSION_SECONDS))

  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('token request failed', res.status, detail)
    return Response.json({ error: 'Could not start a voice session. Please try again.' }, { status: 502 })
  }
  const { token } = await res.json()

  // A second, cheap streaming session for the "hear it both ways" comparison. Optional.
  let shadowToken: string | null = null
  try {
    const s = await fetch(`https://streaming.assemblyai.com/v3/token?expires_in_seconds=60&max_session_duration_seconds=${MAX_SESSION_SECONDS}`, {
      headers: { Authorization: key }, cache: 'no-store',
    })
    if (s.ok) shadowToken = (await s.json()).token
  } catch { /* the comparison is optional */ }

  return Response.json({ token, shadowToken, maxSeconds: MAX_SESSION_SECONDS })
}
