// Scripted drive-thru orders against the live Voice Agent API, no microphone needed.
//
//   npm run drive -- corrections
//   npm run drive -- all --noise bench/noise/traffic.wav --snr 5 --focus far
//
// Each scenario speaks the guest's lines with a macOS voice, streams them in real
// time (with the noise bed between turns, like a real lane), answers tool calls
// with the same order engine the browser uses, and checks the final order.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { sessionConfig, type VoiceFocus } from '../lib/agent-config'
import { describeLine, emptyOrder, totals, type OrderState } from '../lib/order-engine'
import { recoveryInstructions, runAgentTool, syncHeard } from '../lib/sync'
import { runTool } from '../lib/order-engine'
import { formatPrice } from '../lib/menu'
import { RATE, loadEnv, mixAtSnr, readWav, speak } from './audio'

interface Scenario {
  lines: string[]
  unavailable?: string[]
  expect: (s: OrderState) => string[]
}

const has = (s: OrderState, itemId: string, qty: number, mods: string[] = []) =>
  s.lines.some((l) => l.itemId === itemId && l.qty === qty && mods.every((m) => l.modifiers.includes(m as never)))

const SCENARIOS: Record<string, Scenario> = {
  corrections: {
    lines: [
      'Hi, can I get two Stackhouse Doubles.',
      'Actually, make one of those a single, with no pickles.',
      'And a large chocolate Frostee.',
      "That's everything.",
      'No thanks.',
      "Yep, that's right.",
    ],
    expect: (s) => [
      !has(s, 'stackhouse_double', 1) && 'expected 1 Stackhouse Double',
      !has(s, 'stackhouse_single', 1, ['no_pickles']) && 'expected 1 Stackhouse Single, no pickles',
      !s.lines.some((l) => l.itemId === 'frostee' && l.size === 'large' && l.modifiers.includes('chocolate')) && 'expected a large chocolate Frostee',
      s.lines.length !== 3 && `expected 3 lines, got ${s.lines.length}`,
      !s.submitted && 'expected the order to be submitted',
    ].filter(Boolean) as string[],
  },
  prank: {
    lines: [
      'Can I get eighteen thousand waters?',
      'Ha, just kidding. Just one water please.',
      "That's it.",
      'No thank you.',
      'Yes.',
    ],
    expect: (s) => [
      !has(s, 'bottled_water', 1) && 'expected exactly 1 Bottled Water',
      s.lines.some((l) => l.qty > 10) && 'a line has more than 10 items',
      !s.submitted && 'expected the order to be submitted',
    ].filter(Boolean) as string[],
  },
  meal: {
    lines: [
      'Let me get a Spicy Cluckwich meal, large, with a Sweet Tea.',
      'And ten Cluck Bites with honey mustard.',
      "That's all.",
      'Sure, why not.',
      'A small chocolate one.',
      "No, that's all.",
      "That's correct.",
    ],
    expect: (s) => [
      !s.lines.some((l) => l.itemId === 'frostee' && l.size === 'small' && l.modifiers.includes('chocolate')) && 'expected a small chocolate Frostee from the upsell',
      !s.lines.some((l) => l.itemId === 'spicy_cluckwich' && l.meal?.size === 'large' && l.meal.drinkId === 'sweet_tea') && 'expected a large Spicy Cluckwich meal with Sweet Tea',
      !s.lines.some((l) => l.itemId === 'cluck_bites' && l.size === '10pc') && 'expected 10-piece Cluck Bites',
      !s.submitted && 'expected the order to be submitted',
    ].filter(Boolean) as string[],
  },
  frostee_down: {
    unavailable: ['frostee'],
    lines: [
      'Can I get a medium vanilla Frostee?',
      'Aw, okay. An Apple Turnover then.',
      "That's it.",
      'No thanks.',
      'Yes please.',
    ],
    expect: (s) => [
      s.lines.some((l) => l.itemId === 'frostee') && 'a Frostee was sold while the machine was down',
      !has(s, 'apple_turnover', 1) && 'expected 1 Apple Turnover',
    ].filter(Boolean) as string[],
  },
  human: {
    lines: [
      'I want a Stackhouse Triple.',
      'Ugh, this is annoying. Can I just talk to a real person?',
    ],
    expect: (s) => [!s.humanRequested && 'expected a crew handoff'].filter(Boolean) as string[],
  },
}

// ------------------------------------------------------------------ cli ---

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf('--' + name)
  return i > 0 ? process.argv[i + 1] : fallback
}

loadEnv()
const KEY = process.env.ASSEMBLYAI_API_KEY
if (!KEY) { console.error('Set ASSEMBLYAI_API_KEY in .env.local'); process.exit(1) }

const adhoc = arg('lines')
if (adhoc) SCENARIOS.adhoc = { lines: adhoc.split('|').map((l) => l.trim()).filter(Boolean), expect: () => [] }
const which = adhoc ? 'adhoc' : process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'corrections'
const names = which === 'all' ? Object.keys(SCENARIOS) : [which]
const focusArg = arg('focus', 'far')!
const voiceFocus: VoiceFocus = focusArg === 'off' ? 'off' : focusArg === 'near' ? 'near-field' : 'far-field'
const keyterms = arg('keyterms', '1') !== '0'
const voice = arg('voice', 'Samantha')!
const noisePath = arg('noise')
const snr = Number(arg('snr', '10'))
const noise = noisePath ? readWav(noisePath) : null
const CACHE = join('bench', '.cache', 'tts')
const DEBUG = process.argv.includes('--debug')
const AGENT_ID = arg('agent')

// ----------------------------------------------------------------- run ---

async function token(): Promise<string> {
  const url = new URL('https://agents.assemblyai.com/v1/token')
  url.searchParams.set('expires_in_seconds', '60')
  url.searchParams.set('max_session_duration_seconds', '300')
  const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } })
  if (!res.ok) throw new Error(`token: ${res.status} ${await res.text()}`)
  return (await res.json()).token
}

interface Log { t: number; kind: string; text: string }

async function runScenario(name: string) {
  const sc = SCENARIOS[name]
  if (!sc) throw new Error(`Unknown scenario ${name}. Try: ${Object.keys(SCENARIOS).join(', ')}, all`)
  const unavailable = new Set(sc.unavailable ?? [])
  const turns = sc.lines.map((text) => {
    const clean = speak(text, voice, CACHE)
    return noise ? mixAtSnr(clean, noise, snr) : clean
  })
  // Gain that puts the between-turn noise bed at the same level it has under speech.
  const bedGain = (() => {
    if (!noise) return 0
    const rms = (a: Int16Array) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length)
    const speechRms = rms(speak(sc.lines[0], voice, CACHE))
    return speechRms / (rms(noise) * Math.pow(10, snr / 20))
  })()

  const t0 = Date.now()
  const log: Log[] = []
  const say = (kind: string, text: string) => {
    const t = (Date.now() - t0) / 1000
    log.push({ t, kind, text })
    console.log(`${t.toFixed(1).padStart(6)}s  ${kind.padEnd(7)} ${text}`)
  }

  let committed = emptyOrder()
  let speculative = committed
  let pending: { callId: string; result: unknown; isError: boolean; state: OrderState; heard: string[] }[] = []
  let unsynced: string[] = []
  let lastEvent: string | null = null
  let ready = false
  let turn = 0
  let queue: Int16Array | null = null
  let queuePos = 0
  let noisePos = 0
  let agentAudioEndsAt = 0
  let agentSpokeSinceTurn = true
  let speechStoppedAt: number | null = null
  // Empty-reply recovery: sync the order ourselves and tell the agent what to say.
  let replyHadContent = false
  let nudges = 0
  const latencies: number[] = []

  const ws = new WebSocket(`wss://agents.assemblyai.com/v1/ws?token=${encodeURIComponent(await token())}`)
  const send = (m: unknown) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m))

  const flush = () => {
    if (lastEvent !== 'reply.done' || !pending.length) return
    for (const p of pending) {
      send({ type: 'tool.result', call_id: p.callId, result: JSON.stringify(p.result), is_error: p.isError })
      committed = p.state
    }
    pending = []
  }

  const done = new Promise<void>((resolve) => {
    const timeout = setTimeout(() => { say('timeout', 'scenario took too long'); finish() }, Number(arg('timeout') ?? 180) * 1000)
    let finished = false
    function finish() {
      if (finished) return
      finished = true
      clearTimeout(timeout)
      clearInterval(ticker)
      send({ type: 'session.end' })
      setTimeout(() => { ws.close(); resolve() }, 500)
    }

    // 50 ms of audio every 50 ms: speech when a turn is queued, otherwise the noise bed (or near-silence).
    const CHUNK = RATE / 20
    const ticker = setInterval(() => {
      if (!ready) return
      const now = Date.now()
      const idle = !queue && lastEvent === 'reply.done' && !pending.length && agentSpokeSinceTurn && now > agentAudioEndsAt + 700
      if (idle) {
        if (turn < turns.length) {
          say('guest', sc.lines[turn])
          queue = turns[turn++]
          queuePos = 0
          agentSpokeSinceTurn = false
        } else if (now > agentAudioEndsAt + 2500) {
          finish()
          return
        }
      }
      const out = new Int16Array(CHUNK)
      for (let i = 0; i < CHUNK; i++) {
        if (queue && queuePos < queue.length) out[i] = queue[queuePos++]
        else if (noise) out[i] = Math.round(noise[noisePos++ % noise.length] * bedGain)
        else out[i] = Math.round((Math.random() - 0.5) * 6)
      }
      if (queue && queuePos >= queue.length) queue = null
      send({ type: 'input.audio', audio: Buffer.from(out.buffer).toString('base64') })
    }, 50)

    ws.onopen = () => send({
      type: 'session.update',
      session: AGENT_ID ? { agent_id: AGENT_ID } : sessionConfig({ voiceFocus, keyterms, minSilence: Number(arg('min-silence') ?? 0) || undefined, maxSilence: Number(arg('max-silence') ?? 0) || undefined }),
    })
    ws.onclose = () => finish()
    ws.onerror = () => { say('error', 'websocket error'); finish() }
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data))
      if (DEBUG && !['reply.audio', 'transcript.agent.delta', 'transcript.user.delta'].includes(m.type)) {
        console.log('        · ' + m.type + ' ' + JSON.stringify(m).slice(0, 220))
      }
      switch (m.type) {
        case 'session.ready': ready = true; lastEvent = 'reply.done'; agentSpokeSinceTurn = false; say('ready', m.session_id); break
        case 'input.speech.stopped': speechStoppedAt = Date.now(); break
        case 'reply.started': lastEvent = 'reply.started'; replyHadContent = false; break
        case 'reply.audio': {
          const now = Date.now()
          if (speechStoppedAt != null) { latencies.push(now - speechStoppedAt); speechStoppedAt = null }
          const ms = (Buffer.from(m.data, 'base64').length / 2 / RATE) * 1000
          agentAudioEndsAt = Math.max(agentAudioEndsAt, now) + ms
          agentSpokeSinceTurn = true
          break
        }
        case 'transcript.user': if (m.text?.trim()) { say('heard', m.text); unsynced.push(m.text); nudges = 0 } break
        case 'transcript.agent': replyHadContent = true; say('agent', m.text + (m.interrupted ? '  [cut off]' : '')); break
        case 'tool.call': {
          replyHadContent = true
          const heardNow = unsynced
          unsynced = []
          const o = runAgentTool(speculative, m.name, m.arguments ?? {}, heardNow, { unavailable, nextOrderNumber: () => 100 + turn })
          speculative = o.state
          pending.push({ callId: m.call_id, result: o.result, isError: !o.ok, state: o.state, heard: heardNow })
          const detail = o.summary.changed.length ? ' ' + o.summary.changed.join('; ') : ''
          const ask = o.summary.ask.length ? ' ? ' + o.summary.ask.join(' ') : ''
          say('tool', `${o.ok ? '✓' : '✗'} ${m.name}${detail}${ask}${o.ok ? '' : ' → ' + o.result.error}`)
          flush()
          break
        }
        case 'reply.done':
          if (m.status === 'interrupted' && pending.length) {
            unsynced = [...pending.flatMap((p) => p.heard), ...unsynced]
            pending = []; speculative = committed; say('tool', '↺ interrupted, rolled back')
          }
          lastEvent = 'reply.done'
          flush()
          if (m.status === 'completed' && !replyHadContent && !pending.length && nudges < 2) {
            nudges++
            const heardNow = unsynced
            unsynced = []
            const { state: synced, summary } = syncHeard(committed, heardNow, { unavailable })
            committed = speculative = summary.wantsHuman ? runTool(synced, 'request_human', {}).state : synced
            const instructions = recoveryInstructions(summary, committed)
            say('recover', `empty reply → synced locally${summary.changed.length ? ': ' + summary.changed.join('; ') : ''} → "${instructions.slice(0, 90)}"`)
            send({ type: 'reply.create', instructions })
            lastEvent = 'reply.started'
          }
          break
        case 'session.error': case 'error': say('error', `${m.code ?? m.error_code}: ${m.message}`); break
      }
    }
  })
  await done

  const failures = sc.expect(committed)
  const t = totals(committed)
  const sorted = [...latencies].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] ?? null
  console.log('\nFinal order:')
  committed.lines.forEach((l) => console.log('  ' + describeLine(l)))
  console.log(`  total ${formatPrice(t.total)}${committed.submitted ? ` · submitted #${committed.submitted.orderNumber}` : ''}${committed.humanRequested ? ' · crew requested' : ''}`)
  console.log(`  reply latency median ${median ?? '–'} ms over ${latencies.length} replies`)
  console.log(failures.length ? `✗ ${name}: ${failures.join('; ')}` : `✓ ${name}: passed`)

  mkdirSync(join('bench', 'runs'), { recursive: true })
  writeFileSync(join('bench', 'runs', `${name}-${Date.now()}.json`), JSON.stringify({
    scenario: name, voice, voiceFocus, keyterms, noise: noisePath ?? null, snr: noise ? snr : null,
    passed: failures.length === 0, failures, latencies, order: committed.lines.map(describeLine), log,
  }, null, 2))
  return failures.length === 0
}

async function main() {
  let allPassed = true
  for (const name of names) {
    console.log(`\n=== ${name} (voice focus ${voiceFocus}, key terms ${keyterms ? 'on' : 'off'}${noise ? `, noise ${snr} dB SNR` : ''}) ===`)
    allPassed = (await runScenario(name)) && allPassed
  }
  process.exit(allPassed ? 0 : 1)
}
main()
