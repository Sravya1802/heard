// Save a real Voice Agent session as a static replay the judges can always watch,
// even if the live demo is down or the mic is blocked.
//
//   npx tsx scripts/save-replay.ts <session_id> --title "Two doubles, one correction"
//
// Writes public/replays/<id>/{audio.m4a,events.json} and updates public/replays/index.json.
// Audio: the session's stereo recording (driver left, agent right), converted with
// macOS afconvert so it plays in every browser.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadEnv } from './audio'

loadEnv()
const KEY = process.env.ASSEMBLYAI_API_KEY!
const id = process.argv[2]
if (!id?.startsWith('sess_')) { console.error('usage: save-replay.ts <session_id> [--title "..."]'); process.exit(1) }
const titleIdx = process.argv.indexOf('--title')
const title = titleIdx > 0 ? process.argv[titleIdx + 1] : 'A real order'

interface Turn {
  trigger: string
  status: string
  user_transcript: string | null
  agent_text: string | null
  user_speech_started_at_ms: number | null
  user_speech_ended_at_ms: number | null
  agent_reply_started_at_ms: number | null
  agent_reply_ended_at_ms: number | null
  tool_calls?: { name: string; result: string; dispatched_at_ms: number; result_received_at_ms: number; is_error: boolean }[]
}

type Event =
  | { t: number; kind: 'guest'; text: string }
  | { t: number; kind: 'agent'; text: string; end: number }
  | { t: number; kind: 'tool'; name: string; changed: string[]; ask?: string; error?: string }
  | { t: number; kind: 'order'; lines: string[]; total?: string; submitted?: number; crew?: boolean }

async function main() {
  const session = await (await fetch(`https://agents.assemblyai.com/v1/sessions/${id}`, { headers: { Authorization: `Bearer ${KEY}` } })).json()
  const art = (type: string) => session.artifacts?.find((a: { type: string }) => a.type === type)?.url
  if (!art('timeline') || !art('audio')) { console.error('Session artifacts are not ready yet (they appear about 90 s after a session ends).'); process.exit(1) }
  const timeline = await (await fetch(art('timeline'))).json()
  const t0: number = timeline.started_at_unix_ms
  const sec = (ms: number) => Math.round((ms - t0) / 10) / 100

  const events: Event[] = []
  let lastTool = 0
  let lines: string[] = []
  for (const turn of timeline.turns as Turn[]) {
    if (turn.user_transcript && turn.user_speech_started_at_ms) {
      events.push({ t: sec(turn.user_speech_started_at_ms), kind: 'guest', text: turn.user_transcript })
    }
    for (const c of turn.tool_calls ?? []) {
      let r: Record<string, unknown> = {}
      try { r = JSON.parse(c.result) } catch { /* not JSON */ }
      const t = sec(c.result_received_at_ms)
      lastTool = t
      const changed = [...((r.changed as string[]) ?? []), ...((r.also_changed as string[]) ?? [])]
      events.push({ t, kind: 'tool', name: c.name, changed, ask: (r.ask ?? r.ask_first) as string | undefined, error: r.ok === false ? String(r.error) : undefined })
      if (Array.isArray(r.order)) lines = (r.order as { text: string }[]).map((o) => o.text)
      else if (changed.length || c.name === 'read_back' || c.name === 'submit_order' || c.name === 'request_human') {
        // Non-sync tools don't return the whole order; keep the last one we saw.
      }
      events.push({
        t, kind: 'order', lines: [...lines],
        total: typeof r.total === 'string' ? r.total : undefined,
        submitted: typeof r.order_number === 'number' ? r.order_number : undefined,
        crew: c.name === 'request_human' || undefined,
      })
    }
    if (turn.agent_text && turn.agent_reply_ended_at_ms) {
      const end = sec(turn.agent_reply_ended_at_ms)
      // Tool-triggered replies only carry an end time; estimate the start from length.
      const start = turn.agent_reply_started_at_ms ? sec(turn.agent_reply_started_at_ms) : Math.max(lastTool + 0.3, end - turn.agent_text.length / 14)
      events.push({ t: Math.round(start * 100) / 100, kind: 'agent', text: turn.agent_text, end })
    }
  }
  events.sort((a, b) => a.t - b.t)

  const dir = join('public', 'replays', id)
  mkdirSync(dir, { recursive: true })
  const ogg = join(dir, 'audio.ogg')
  writeFileSync(ogg, Buffer.from(await (await fetch(art('audio'))).arrayBuffer()))
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '96000', ogg, join(dir, 'audio.m4a')])
  execFileSync('rm', [ogg])
  const duration = Math.round((session.duration_seconds ?? 0) * 10) / 10
  writeFileSync(join(dir, 'events.json'), JSON.stringify({ id, title, duration, recordedAt: session.created_at, events }, null, 1))

  const indexPath = join('public', 'replays', 'index.json')
  const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : []
  const next = [{ id, title, duration, recordedAt: session.created_at }, ...index.filter((r: { id: string }) => r.id !== id)]
  writeFileSync(indexPath, JSON.stringify(next, null, 2))
  console.log(`saved ${dir} (${events.length} events, ${duration}s)`)
}
main()
