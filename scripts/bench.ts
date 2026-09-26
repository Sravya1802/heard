// The noise benchmark: does the drive-thru order survive the drive-thru?
//
//   npm run noise && npm run bench            # full matrix, ~12 min, well under $1
//   npm run bench -- --only road5 --configs generic,focus   # a slice
//
// For every noise condition × STT configuration, all 24 order lines are
// streamed in real time through one AssemblyAI streaming session, with the
// noise bed running continuously (including between lines, like a real lane).
// Words are mapped back to lines by their timestamps, then scored:
//   - menu accuracy: share of menu terms (items, sizes, options, quantities) heard
//   - perfect lines: lines where every menu term was heard
//   - WER against the reference text
//   - back-seat leaks: words that only the kids in the back said, showing up anyway

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ORDER_LINES, DRIVER_VOICES, BACKSEAT_LINES } from '../bench/testset'
import { TRANSCRIPTION_PROMPT } from '../lib/agent-config'
import { menuKeyterms } from '../lib/menu'
import { describeLine, emptyOrder, runTool } from '../lib/order-engine'
import { parseUtterance } from '../lib/order-parser'
import { RATE, loadEnv, readWav, speak } from './audio'

loadEnv()
const KEY = process.env.ASSEMBLYAI_API_KEY
if (!KEY) { console.error('Set ASSEMBLYAI_API_KEY in .env.local'); process.exit(1) }

// ------------------------------------------------------------- matrix ---

interface Condition { id: string; label: string; road?: number; backseat?: number }
// Numbers are SNR in dB of the driver over that noise source (lower = louder noise).
const CONDITIONS: Condition[] = [
  { id: 'clean', label: 'Quiet lane' },
  { id: 'road10', label: 'Road noise (10 dB)', road: 10 },
  { id: 'road5', label: 'Road noise (5 dB)', road: 5 },
  { id: 'road0', label: 'Road noise (0 dB)', road: 0 },
  { id: 'backseat5', label: 'Back-seat chatter (5 dB)', backseat: 5 },
  { id: 'rush', label: 'Road + back seat (5 dB)', road: 5, backseat: 5 },
]

interface Config { id: string; label: string; params: Record<string, string> }
const CONFIGS: Config[] = [
  { id: 'generic', label: 'Previous-gen streaming STT', params: { speech_model: 'universal-streaming-english' } },
  { id: 'u3', label: 'Universal-3.6 Pro', params: { speech_model: 'universal-3-6-pro' } },
  { id: 'menu', label: '+ menu key terms & prompt', params: { speech_model: 'universal-3-6-pro', keyterms_prompt: JSON.stringify(menuKeyterms()), prompt: TRANSCRIPTION_PROMPT } },
  { id: 'focus', label: '+ voice focus (far-field)', params: { speech_model: 'universal-3-6-pro', keyterms_prompt: JSON.stringify(menuKeyterms()), prompt: TRANSCRIPTION_PROMPT, voice_focus: 'far-field' } },
]

function arg(name: string) {
  const i = process.argv.indexOf('--' + name)
  return i > 0 ? process.argv[i + 1] : undefined
}
const onlyConditions = arg('only')?.split(',')
const onlyConfigs = arg('configs')?.split(',')
const PARALLEL = Number(arg('parallel') ?? 4)

// ------------------------------------------------------------- audio ---

const CACHE = join('bench', '.cache', 'tts')
const GAP = Math.round(1.4 * RATE)
const LEAD = Math.round(1.0 * RATE)

const lines = ORDER_LINES.map((u, i) => speak(u.text, DRIVER_VOICES[i % DRIVER_VOICES.length], CACHE))
const road = readWav(join('bench', 'noise', 'road.wav'))
const backseat = readWav(join('bench', 'noise', 'backseat.wav'))
const rms = (a: Int16Array | Float32Array, from = 0, to = a.length) => {
  let s = 0
  for (let i = from; i < to; i++) s += a[i] * a[i]
  return Math.sqrt(s / Math.max(1, to - from))
}
const speechRms = rms(Int16Array.from(lines.flatMap((l) => Array.from(l))))

/** One long lane recording: lead-in, then each line with gaps, noise under everything. */
function buildSession(c: Condition) {
  const total = LEAD + lines.reduce((s, l) => s + l.length + GAP, 0)
  const mix = new Float32Array(total)
  const windows: [number, number][] = []
  let pos = LEAD
  for (const l of lines) {
    for (let i = 0; i < l.length; i++) mix[pos + i] += l[i]
    windows.push([pos / RATE * 1000, (pos + l.length) / RATE * 1000])
    pos += l.length + GAP
  }
  const addNoise = (noise: Int16Array, snr: number) => {
    const gain = speechRms / (rms(noise) * Math.pow(10, snr / 20))
    for (let i = 0; i < total; i++) mix[i] += noise[i % noise.length] * gain
  }
  if (c.road != null) addNoise(road, c.road)
  if (c.backseat != null) addNoise(backseat, c.backseat)
  const pcm = new Int16Array(total)
  for (let i = 0; i < total; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(mix[i])))
  return { pcm, windows }
}

// --------------------------------------------------------- streaming ---

interface Word { text: string; start: number; end: number }

async function streamingToken(): Promise<string> {
  const res = await fetch('https://streaming.assemblyai.com/v3/token?expires_in_seconds=60&max_session_duration_seconds=600', { headers: { Authorization: KEY! } })
  if (!res.ok) throw new Error(`streaming token: ${res.status} ${await res.text()}`)
  return (await res.json()).token
}

async function transcribe(pcm: Int16Array, config: Config): Promise<Word[]> {
  const params = new URLSearchParams({ sample_rate: String(RATE), encoding: 'pcm_s16le', format_turns: 'true', ...config.params, token: await streamingToken() })
  const ws = new WebSocket(`wss://streaming.assemblyai.com/v3/ws?${params}`)
  ws.binaryType = 'arraybuffer'
  const words: Word[] = []
  const turns = new Map<number, Word[]>()
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setInterval> | undefined
    const hardStop = setTimeout(() => { ws.close(); reject(new Error('timed out')) }, (pcm.length / RATE + 60) * 1000)
    ws.onopen = () => {
      // 50 ms of audio every 50 ms: real time, like a live lane.
      const CHUNK = RATE / 20
      let pos = 0
      timer = setInterval(() => {
        if (pos >= pcm.length) {
          clearInterval(timer)
          ws.send(JSON.stringify({ type: 'Terminate' }))
          return
        }
        const chunk = pcm.slice(pos, pos + CHUNK)
        pos += CHUNK
        ws.send(chunk.buffer)
      }, 50)
    }
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data))
      if (m.type === 'Turn' && m.end_of_turn) {
        turns.set(m.turn_order, (m.words ?? []).map((w: Word) => ({ text: w.text, start: w.start, end: w.end })))
      } else if (m.type === 'Termination') {
        for (const [, ws_] of [...turns.entries()].sort((a, b) => a[0] - b[0])) words.push(...ws_)
        clearTimeout(hardStop)
        ws.close()
        resolve(words)
      } else if (m.type === 'Error' || m.error) {
        console.error(config.id, m)
      }
    }
    ws.onerror = () => { clearInterval(timer); clearTimeout(hardStop); reject(new Error(`${config.id}: websocket error`)) }
    ws.onclose = (e) => { clearInterval(timer); if (e.code !== 1000 && e.code !== 1005) reject(new Error(`${config.id}: closed ${e.code} ${e.reason}`)) }
  })
}

// ------------------------------------------------------------ scoring ---

const NUMBERS: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', twenty: '20' }
function normalize(s: string): string {
  return s.toLowerCase().replace(/[-_/]/g, ' ').replace(/[^a-z0-9' ]+/g, ' ').replace(/'/g, '')
    .split(/\s+/).filter(Boolean).map((w) => NUMBERS[w] ?? w).join(' ')
}
function heard(transcript: string, alternatives: string[]): boolean {
  const t = normalize(transcript)
  const squashed = t.replace(/ /g, '')
  return alternatives.some((a) => {
    const n = normalize(a)
    // Also accept a split or merged compound ("stack house" / "stackhouse"), which the order engine resolves.
    return (` ${t} `).includes(` ${n}`) || squashed.includes(n.replace(/ /g, ''))
  })
}
function wer(ref: string, hyp: string): { errors: number; words: number } {
  const r = normalize(ref).split(' ').filter(Boolean)
  const h = normalize(hyp).split(' ').filter(Boolean)
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)])
  for (let j = 1; j <= h.length; j++) d[0][j] = j
  for (let i = 1; i <= r.length; i++)
    for (let j = 1; j <= h.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1))
  return { errors: d[r.length][h.length], words: r.length }
}

/** The order that a line produces, starting from its setup order. Same parser and engine as the live agent. */
function orderFrom(text: string, setup?: string): string[] {
  let s = emptyOrder()
  for (const line of setup ? [setup, text] : [text]) {
    const r = parseUtterance(line, s, null)
    if (r.changes.length) s = runTool(s, 'update_order', { changes: r.changes }).state
  }
  return s.lines.map(describeLine)
}
const EXPECTED_ORDERS = ORDER_LINES.map((u) => orderFrom(u.text, u.setup))

/**
 * Split the session transcript back into lines by aligning it to the reference
 * text word by word (edit-distance alignment), so scoring doesn't depend on timestamps.
 */
function splitByAlignment(words: Word[]): string[] {
  const ref: { w: string; line: number }[] = []
  ORDER_LINES.forEach((u, line) => normalize(u.text).split(' ').filter(Boolean).forEach((w) => ref.push({ w, line })))
  const hyp = words.map((w) => ({ raw: w.text, w: normalize(w.text) })).filter((h) => h.w)
  const R = ref.length, H = hyp.length
  const d: Uint32Array[] = Array.from({ length: R + 1 }, () => new Uint32Array(H + 1))
  for (let i = 0; i <= R; i++) d[i][0] = i
  for (let j = 0; j <= H; j++) d[0][j] = j
  for (let i = 1; i <= R; i++)
    for (let j = 1; j <= H; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (ref[i - 1].w === hyp[j - 1].w ? 0 : 1))
  // Walk back: each hypothesis word takes the line of the reference word it aligns with (or the nearest one).
  const lineOf = new Array<number>(H).fill(-1)
  let i = R, j = H
  while (j > 0) {
    if (i > 0 && d[i][j] === d[i - 1][j - 1] + (ref[i - 1].w === hyp[j - 1].w ? 0 : 1)) { lineOf[j - 1] = ref[i - 1].line; i--; j-- }
    else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { i-- }
    else { lineOf[j - 1] = i > 0 ? ref[i - 1].line : 0; j-- }
  }
  const perLine = ORDER_LINES.map(() => [] as string[])
  hyp.forEach((h, k) => perLine[Math.max(0, lineOf[k])].push(h.raw))
  return perLine.map((ws) => ws.join(' '))
}

function score(words: Word[]) {
  const perLine = splitByAlignment(words)
  let found = 0, total = 0, perfect = 0, errors = 0, refWords = 0, exactOrders = 0
  const detail = ORDER_LINES.map((u, i) => {
    const hyp = perLine[i]
    const missed = u.entities.filter((alts) => !heard(hyp, alts)).map((a) => a[0])
    found += u.entities.length - missed.length
    total += u.entities.length
    if (!missed.length) perfect++
    const w = wer(u.text, hyp)
    errors += w.errors; refWords += w.words
    const got = orderFrom(hyp, u.setup)
    const exact = JSON.stringify(got) === JSON.stringify(EXPECTED_ORDERS[i])
    if (exact) exactOrders++
    return { ref: u.text, hyp, missed, order: got, expected: EXPECTED_ORDERS[i], exact }
  })
  const everything = normalize(words.map((w) => w.text).join(' '))
  const leaks = BACKSEAT_LINES.flatMap((l) => l.leak).filter((w) => (` ${everything} `).includes(` ${normalize(w)} `))
  return {
    orderAccuracy: exactOrders / ORDER_LINES.length,
    menuAccuracy: found / total,
    perfectLines: perfect / ORDER_LINES.length,
    wer: errors / refWords,
    leaks,
    detail,
  }
}

// --------------------------------------------------------------- run ---

const jobs = CONDITIONS.filter((c) => !onlyConditions || onlyConditions.includes(c.id))
  .flatMap((c) => CONFIGS.filter((k) => !onlyConfigs || onlyConfigs.includes(k.id)).map((k) => ({ c, k })))
const sessions = new Map(jobs.map(({ c }) => [c.id, buildSession(c)]))
const minutes = jobs.reduce((s, { c }) => s + sessions.get(c.id)!.pcm.length / RATE / 60, 0)
console.log(`${jobs.length} sessions, ${minutes.toFixed(1)} min of audio, ${PARALLEL} at a time (≈${(minutes / PARALLEL).toFixed(0)} min)`)

async function main() {
  const results: Record<string, unknown>[] = []
  const queue = [...jobs]
  async function worker() {
    while (queue.length) {
      const { c, k } = queue.shift()!
      const { pcm } = sessions.get(c.id)!
      const t0 = Date.now()
      try {
        const words = await transcribe(pcm, k)
        const s = score(words)
        results.push({ condition: c.id, conditionLabel: c.label, config: k.id, configLabel: k.label, ...s, transcript: words.map((w) => w.text).join(' ') })
        console.log(`${c.id.padEnd(10)} ${k.id.padEnd(8)} orders ${(s.orderAccuracy * 100).toFixed(0).padStart(3)}%  menu ${(s.menuAccuracy * 100).toFixed(1).padStart(5)}%  perfect ${(s.perfectLines * 100).toFixed(0).padStart(3)}%  WER ${(s.wer * 100).toFixed(1).padStart(5)}%  leaks ${s.leaks.length}  (${Math.round((Date.now() - t0) / 1000)}s)`)
      } catch (e) {
        console.error(`${c.id} ${k.id} failed:`, e instanceof Error ? e.message : e)
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker))

  const order = (r: Record<string, unknown>) => CONDITIONS.findIndex((c) => c.id === r.condition) * 10 + CONFIGS.findIndex((k) => k.id === r.config)
  results.sort((a, b) => order(a) - order(b))
  mkdirSync('bench', { recursive: true })
  const out = {
    ranAt: new Date().toISOString(),
    lines: ORDER_LINES.length,
    menuTerms: ORDER_LINES.reduce((s, u) => s + u.entities.length, 0),
    voices: DRIVER_VOICES,
    conditions: CONDITIONS.filter((c) => !onlyConditions || onlyConditions.includes(c.id)),
    configs: CONFIGS.filter((k) => !onlyConfigs || onlyConfigs.includes(k.id)).map(({ id, label }) => ({ id, label })),
    results,
  }
  const file = onlyConditions || onlyConfigs ? join('bench', `results-partial-${Date.now()}.json`) : join('bench', 'results.json')
  writeFileSync(file, JSON.stringify(out, null, 2))
  console.log(`\nwrote ${file}`)
}
main()
