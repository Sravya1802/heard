'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { sessionConfig, type HearingOptions } from '@/lib/agent-config'
import { MENU_BY_ID, formatPrice } from '@/lib/menu'
import { describeLine, emptyOrder, priceLine, runTool, ticketLine, totals, type OrderState } from '@/lib/order-engine'
import { recoveryInstructions, runAgentTool, syncHeard, type SyncSummary } from '@/lib/sync'
import { openLaneChannel, type LaneChannel, type LaneSnapshot, type SubmittedOrder } from '@/lib/realtime'
import { VoiceSession, type CallStatus } from '@/lib/voice-client'
import NoiseQR from '@/components/NoiseQR'
import HearBothWays from '@/components/HearBothWays'
import { ShadowTranscriber } from '@/lib/shadow-stt'
import { addGeneric, addHeard, type Row } from '@/lib/compare'

const LANE = 1

interface ToolLog { id: number; name: string; detail: string; ok: boolean; rolledBack?: boolean }
interface Caption { who: 'guest' | 'heard'; text: string; interrupted?: boolean }

const STATUS_LABEL: Record<CallStatus, string> = {
  idle: 'Waiting for a car',
  connecting: 'Connecting…',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  ended: 'Drive safe',
  error: 'Something went wrong',
}

interface Scenario { id: string; label: string; lines: string[]; bilingual?: boolean }
interface Decision { id: number; heard: string; action: string; why: string; ok: boolean }

/** What the order engine did, and what it refused to do, in this car. */
const NO_CHECKS = { corrections: 0, capped: 0, unavailable: 0, offMenu: 0, asked: 0 }

/** Suggested scripts, so a judge knows exactly what to say. */
const SCENARIOS: Scenario[] = [
  { id: 'mind', label: 'Changes their mind', lines: ['“Two Spicy Cluckwiches, actually make one of those a Stackhouse Double, no pickles, and a large chocolate Frostee. Wait, scratch the Frostee.”', 'All in one breath. Watch every correction land.'] },
  { id: 'correction', label: 'Mid-order correction', lines: ['“Two Stackhouse Doubles… actually make one of those a single, no pickles.”', '“And a large chocolate Frostee.”'] },
  { id: 'family', label: 'Noisy family car', lines: ['Play the noise from your phone first.', '“Two Spicy Cluckwiches, a ten piece Cluck Bites with ranch, and a large onion rings.”'] },
  { id: 'prank', label: 'Prank & human', lines: ['“Can I get eighteen thousand waters?”', '“Ugh, can I just talk to a real person?”'] },
  { id: 'addon', label: 'Forgot something', lines: ['“A large Stack Fries.” … “That\'s all.” … “Yes.”', 'After the total: “Oh wait, can I also get a large Stack Cola?”'] },
  { id: 'spanglish', label: 'Spanglish', bilingual: true, lines: ['“Quiero dos Stackhouse Doubles, una sin pepinillos.”', '“Y unas papas grandes.” … “Eso es todo.”'] },
]

function toolDetail(name: string, result: Record<string, unknown>, summary: SyncSummary): string {
  const parts: string[] = []
  if (summary.changed.length) parts.push(summary.changed.join('; '))
  if (summary.ask.length) parts.push('asks: ' + summary.ask[0])
  if (!result.ok && result.error) parts.push(String(result.error))
  if (name === 'suggest_upsell') parts.push(result.suggestion ? String(result.suggestion) : 'no offer')
  if (name === 'read_back') parts.push(`read back · ${result.total}`)
  if (name === 'submit_order' && result.ok) parts.push(`order #${result.order_number} · ${result.total}`)
  if (name === 'request_human') parts.push('crew takeover')
  return parts.join(' · ') || (summary.heard.length ? 'no change' : '')
}

export default function Lane({ hearing }: { hearing: HearingOptions }) {
  const [status, setStatus] = useState<CallStatus>('idle')
  const [order, setOrder] = useState<OrderState>(emptyOrder)
  const [flash, setFlash] = useState<Record<string, number>>({})
  const [partial, setPartial] = useState('')
  const [agentPartial, setAgentPartial] = useState('')
  const [captions, setCaptions] = useState<Caption[]>([])
  const [latencies, setLatencies] = useState<number[]>([])
  const [level, setLevel] = useState(0)
  const [tools, setTools] = useState<ToolLog[]>([])
  const [error, setError] = useState<string | null>(null)
  const [crew, setCrew] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [unavailable, setUnavailable] = useState<string[]>([])
  const [showHood, setShowHood] = useState(false)
  const [scenarioId, setScenarioId] = useState(hearing.bilingual ? 'spanglish' : 'mind')
  const [checks, setChecks] = useState(NO_CHECKS)
  const [decisions, setDecisions] = useState<Decision[]>([])
  // "Hear it both ways": the generic transcriber's view of the same audio.
  const [rows, setRows] = useState<Row[]>([])
  const [genericPartial, setGenericPartial] = useState('')
  const [genericOrder, setGenericOrder] = useState<string[]>([])
  const [shadowOn, setShadowOn] = useState(false)
  const [nowTick, setNowTick] = useState(0)

  const session = useRef<VoiceSession | null>(null)
  const channel = useRef<LaneChannel | null>(null)
  const committed = useRef<OrderState>(emptyOrder())
  const speculative = useRef<OrderState>(emptyOrder())
  const unavailableRef = useRef<string[]>([])
  const lastHeard = useRef('')
  const startedAt = useRef(0)
  const toolSeq = useRef(0)
  // Final transcripts not yet applied to the order, and those held by tool calls not yet delivered.
  const unsynced = useRef<string[]>([])
  const inFlight = useRef(new Map<string, string[]>())
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shadow = useRef<ShadowTranscriber | null>(null)
  const shadowState = useRef<OrderState>(emptyOrder())

  const live = status === 'listening' || status === 'thinking' || status === 'speaking'

  // ---- kitchen link ----
  useEffect(() => {
    const ch = openLaneChannel()
    channel.current = ch
    ch.on('availability', ({ unavailable }) => { unavailableRef.current = unavailable; setUnavailable(unavailable) })
    fetch('/api/availability').then((r) => r.json()).then(({ unavailable }) => {
      unavailableRef.current = unavailable ?? []
      setUnavailable(unavailable ?? [])
    }).catch(() => {})
    return () => { ch.close(); session.current?.stop() }
  }, [])

  const broadcast = useCallback((state: OrderState, laneStatus: LaneSnapshot['status']) => {
    channel.current?.send('lane', {
      lane: LANE,
      status: laneStatus,
      lines: state.lines.map(ticketLine),
      total: formatPrice(totals(state).total),
      heard: lastHeard.current,
      updatedAt: Date.now(),
    })
  }, [])

  // ---- call timer ----
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => { setElapsed(Math.round((Date.now() - startedAt.current) / 1000)); setNowTick(Date.now()) }, 500)
    return () => clearInterval(t)
  }, [live])

  /** Feeds the "Verified order" strip and the "How Heard decided" log. */
  const countChecks = (summary: SyncSummary) => {
    const n = (codes: string[]) => summary.refused.filter((e) => codes.includes(e)).length
    const delta = {
      corrections: summary.changed.filter((c) => c.startsWith('now ') || c.startsWith('removed ')).length,
      capped: n(['quantity_too_high', 'order_too_large']),
      unavailable: n(['unavailable']),
      offMenu: n(['not_on_menu']),
      asked: n(['size_required', 'flavor_required', 'meal_drink_required', 'kids_main_required']),
    }
    if (Object.values(delta).some(Boolean)) {
      setChecks((c) => ({
        corrections: c.corrections + delta.corrections, capped: c.capped + delta.capped,
        unavailable: c.unavailable + delta.unavailable, offMenu: c.offMenu + delta.offMenu, asked: c.asked + delta.asked,
      }))
    }
    if (summary.explain.length) {
      setDecisions((d) => [...summary.explain.map((e) => ({ id: ++toolSeq.current, ...e })).reverse(), ...d].slice(0, 30))
    }
  }

  const addTool = (entry: Omit<ToolLog, 'id'>) => setTools((t) => [{ id: ++toolSeq.current, ...entry }, ...t].slice(0, 40))

  const endSoon = (ms: number) => {
    if (endTimer.current) clearTimeout(endTimer.current)
    endTimer.current = setTimeout(() => session.current?.stop(), ms)
  }

  const start = async () => {
    setError(null)
    setOrder(emptyOrder())
    committed.current = speculative.current = emptyOrder()
    setCaptions([]); setPartial(''); setAgentPartial(''); setTools([]); setLatencies([]); setCrew(false); setFlash({})
    lastHeard.current = ''
    unsynced.current = []
    inFlight.current.clear()
    setRows([]); setGenericPartial(''); setGenericOrder([]); setShadowOn(false)
    setChecks(NO_CHECKS)
    setDecisions([])
    shadowState.current = emptyOrder()

    const ctx = () => ({
      unavailable: new Set(unavailableRef.current),
      nextOrderNumber: () => 100 + (Math.floor(Date.now() / 1000) % 900),
    })

    /** Commit a new order state to the board and the kitchen, flashing what changed. */
    const commitState = (next: OrderState) => {
      const prev = committed.current
      committed.current = next
      setOrder(next)
      const changed = next.lines.filter((l) => {
        const before = prev.lines.find((p) => p.id === l.id)
        return !before || JSON.stringify(before) !== JSON.stringify(l)
      })
      if (changed.length) setFlash((f) => ({ ...f, ...Object.fromEntries(changed.map((l) => [l.id, (f[l.id] ?? 0) + 1])) }))
    }

    const s = new VoiceSession({
      onStatus: (st, detail) => {
        setStatus(st)
        if (st === 'error' && detail) setError(detail)
      },
      onReady: () => {
        startedAt.current = Date.now()
        broadcast(committed.current, 'ordering')
      },
      onShadowToken: (tok) => {
        const sh = new ShadowTranscriber({
          onPartial: setGenericPartial,
          onFinal: (text) => {
            setGenericPartial('')
            setRows((r) => addGeneric(r, text, Date.now()))
            // Build the order the generic transcript would produce, with the same parser and engine.
            const { state } = syncHeard(shadowState.current, [text], ctx())
            shadowState.current = state
            setGenericOrder(state.lines.map(describeLine))
          },
        })
        sh.start(tok)
        shadow.current = sh
        setShadowOn(true)
      },
      onAudioFrame: (pcm) => shadow.current?.send(pcm),
      onUserPartial: (text) => {
        setPartial(text)
        // Still talking after the total ("oh, and a cola"): don't hang up on them.
        if (endTimer.current && text.trim()) { clearTimeout(endTimer.current); endTimer.current = null }
      },
      onUserFinal: (text) => {
        setPartial('')
        if (!text.trim()) return
        lastHeard.current = text
        unsynced.current.push(text)
        setRows((r) => addHeard(r, text, Date.now()))
        setCaptions((c) => [...c, { who: 'guest' as const, text }].slice(-12))
      },
      onAgentPartial: setAgentPartial,
      onAgentFinal: (text, interrupted) => {
        setAgentPartial('')
        if (text.trim()) setCaptions((c) => [...c, { who: 'heard' as const, text, interrupted }].slice(-12))
      },
      onLatency: (ms) => setLatencies((l) => [...l, ms].slice(-50)),
      onMicLevel: (lv) => setLevel(lv),
      onToolCall: (name, args, callId) => {
        const heard = unsynced.current
        unsynced.current = []
        inFlight.current.set(callId, heard)
        const outcome = runAgentTool(speculative.current, name, args, heard, ctx())
        speculative.current = outcome.state
        const detail = toolDetail(name, outcome.result, outcome.summary)
        return {
          result: outcome.result,
          isError: !outcome.ok,
          commit: () => {
            inFlight.current.delete(callId)
            commitState(outcome.state)
            addTool({ name, detail, ok: outcome.ok })
            countChecks(outcome.summary)
            if (name === 'submit_order' && outcome.ok && outcome.state.submitted) {
              const submitted: SubmittedOrder = {
                orderNumber: outcome.state.submitted.orderNumber,
                lane: LANE,
                lines: outcome.state.lines.map(ticketLine),
                total: formatPrice(outcome.state.submitted.totalCents),
                sessionId: s.id,
                submittedAt: Date.now(),
                seconds: Math.round((Date.now() - startedAt.current) / 1000),
                updated: outcome.state.submitted.updated,
              }
              channel.current?.send('order', submitted)
              void fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(submitted) })
              broadcast(outcome.state, 'submitted')
              endSoon(12000)
            } else if (name === 'request_human' && outcome.ok) {
              setCrew(true)
              channel.current?.send('crew', { lane: LANE, reason: lastHeard.current, at: Date.now() })
              broadcast(outcome.state, 'crew')
              endSoon(7000)
            } else {
              broadcast(outcome.state, 'ordering')
            }
          },
        }
      },
      onEmptyReply: () => {
        // The model produced nothing. Sync the order ourselves and tell it exactly what to say.
        const heard = unsynced.current
        unsynced.current = []
        const { state, summary } = syncHeard(speculative.current, heard, ctx())
        const next = summary.wantsHuman ? runTool(state, 'request_human', {}).state : state
        speculative.current = next
        commitState(next)
        countChecks(summary)
        addTool({ name: 'recovered', detail: toolDetail('sync_order', { ok: true }, summary) || 'empty reply, re-prompted', ok: true, rolledBack: true })
        if (summary.wantsHuman) {
          setCrew(true)
          channel.current?.send('crew', { lane: LANE, reason: lastHeard.current, at: Date.now() })
          broadcast(next, 'crew')
          endSoon(7000)
        } else {
          broadcast(next, 'ordering')
        }
        return recoveryInstructions(summary, next)
      },
      onToolsDiscarded: () => {
        speculative.current = committed.current
        // Put back what those calls had consumed, so it is applied on the next sync.
        unsynced.current = [...[...inFlight.current.values()].flat(), ...unsynced.current]
        inFlight.current.clear()
        addTool({ name: 'interrupted', detail: 'guest cut in, pending changes rolled back', ok: true, rolledBack: true })
      },
      onError: (code, message) => {
        console.warn('voice agent error', code, message)
        if (!['invalid_value', 'invalid_format'].includes(code)) setError(message)
      },
      onEnded: () => {
        shadow.current?.stop()
        shadow.current = null
        if (!committed.current.submitted) broadcast(committed.current, committed.current.humanRequested ? 'crew' : 'waiting')
      },
    })
    session.current = s
    try {
      await s.start({ session: sessionConfig(hearing) })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(/permission|denied|NotAllowed/i.test(msg) ? 'Microphone access was blocked. Allow the mic for this site, or watch a recorded order instead.' : msg)
      setStatus('error')
      s.stop()
    }
  }

  const stop = () => {
    shadow.current?.stop()
    shadow.current = null
    if (endTimer.current) clearTimeout(endTimer.current)
    session.current?.stop()
  }

  const t = totals(order)
  const ignored = rows.filter((r) => r.heard == null && r.genericAt != null && nowTick - r.genericAt > 4000).length
  const scenario = SCENARIOS.find((x) => x.id === scenarioId) ?? SCENARIOS[0]
  const lastLatency = latencies.at(-1)
  const sorted = [...latencies].sort((a, b) => a - b)
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : undefined
  const focusLabel = hearing.voiceFocus === 'off' ? 'Voice focus off' : `Voice focus · ${hearing.voiceFocus}`

  return (
    <main className="flex-1 flex flex-col w-full max-w-[1400px] mx-auto px-4 sm:px-6 py-4 gap-4">
      {/* ---- top bar ---- */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href="/" className="font-display text-2xl font-extrabold tracking-tight">
          <span className="text-mustard">STACK</span>HOUSE
        </Link>
        <span className="text-xs font-mono uppercase tracking-widest text-muted border border-line rounded px-2 py-1">Lane {LANE}</span>
        <span className="flex items-center gap-2 text-sm">
          <span className={`inline-block size-2.5 rounded-full ${live ? 'bg-pickle pulse-dot' : status === 'error' ? 'bg-ketchup' : 'bg-faint'}`} />
          {STATUS_LABEL[status]}
          {live && <span className="font-mono text-muted tabular-nums">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs font-mono">
          {lastLatency != null && (
            <span className="rounded bg-panel-2 border border-line px-2 py-1" title="Time from the end of your speech to the first audio of the reply">
              heard → reply <span className="text-pickle">{lastLatency} ms</span>
              {median != null && latencies.length > 2 && <span className="text-muted"> · median {median}</span>}
            </span>
          )}
          <span className={`rounded border px-2 py-1 ${hearing.voiceFocus === 'off' ? 'border-ketchup text-ketchup' : 'border-line text-muted'}`}>{focusLabel}</span>
          <span className={`rounded border px-2 py-1 ${hearing.keyterms ? 'border-line text-muted' : 'border-ketchup text-ketchup'}`}>Menu key terms {hearing.keyterms ? 'on' : 'off'}</span>
          <span className="inline-flex rounded border border-line overflow-hidden" role="group" aria-label="Lane language">
            <Link href="/lane" className={`px-2 py-1 ${!hearing.bilingual ? 'bg-ink text-asphalt' : 'text-muted hover:text-ink'}`}>English</Link>
            <Link href="/lane?lang=es" className={`px-2 py-1 ${hearing.bilingual ? 'bg-ink text-asphalt' : 'text-muted hover:text-ink'}`}>Español + English</Link>
          </span>
          <Link href="/kitchen" target="_blank" className="rounded border border-mustard text-mustard px-2 py-1 hover:bg-mustard hover:text-asphalt">Kitchen screen ↗</Link>
        </div>
      </header>

      <div className="flex-1 grid gap-4 lg:grid-cols-[1.6fr_1fr] min-h-0">
        <div className="flex flex-col gap-4 min-w-0">
        {/* ---- order confirmation board ---- */}
        <section className="relative flex flex-col rounded-2xl border border-line bg-panel overflow-hidden min-h-[240px] lg:min-h-[300px]">
          <div className="flex items-baseline justify-between px-6 pt-5 pb-3 border-b border-line">
            <h1 className="font-display text-3xl font-bold">Your order</h1>
            <span className="text-sm text-muted">{t.itemCount ? `${t.itemCount} item${t.itemCount === 1 ? '' : 's'}` : ''}</span>
          </div>

          {(order.lines.length > 0 || checks.capped + checks.unavailable + checks.offMenu + checks.asked > 0) && (
            <div className="flex flex-wrap gap-1.5 px-5 py-2.5 border-b border-line text-xs font-mono">
              <span className="text-faint uppercase tracking-wider self-center mr-1">Verified order</span>
              {order.lines.length > 0 && <span className="rounded bg-pickle/15 text-pickle px-2 py-0.5">✓ built from what was heard</span>}
              {checks.corrections > 0 && <span className="rounded bg-sky/15 text-sky px-2 py-0.5">↺ {checks.corrections} correction{checks.corrections === 1 ? '' : 's'} applied</span>}
              {checks.asked > 0 && <span className="rounded bg-mustard/15 text-mustard px-2 py-0.5">? asked instead of guessing</span>}
              {checks.capped > 0 && <span className="rounded bg-ketchup/15 text-ketchup px-2 py-0.5">✗ capped a suspicious quantity</span>}
              {checks.unavailable > 0 && <span className="rounded bg-ketchup/15 text-ketchup px-2 py-0.5">✗ didn&apos;t sell an unavailable item</span>}
              {checks.offMenu > 0 && <span className="rounded bg-ketchup/15 text-ketchup px-2 py-0.5">✗ didn&apos;t invent an off-menu item</span>}
              {ignored > 0 && <span className="rounded bg-panel-2 border border-line text-muted px-2 py-0.5">◌ {ignored} background voice{ignored === 1 ? '' : 's'} ignored</span>}
              {order.lines.length > 0 && (order.submitted
                ? <span className="rounded bg-pickle/15 text-pickle px-2 py-0.5">✓ read back · sent to kitchen</span>
                : order.readBackVersion === order.version
                  ? <span className="rounded bg-pickle/15 text-pickle px-2 py-0.5">✓ read back to guest</span>
                  : <span className="rounded bg-panel-2 border border-line text-muted px-2 py-0.5">… read-back before sending</span>)}
            </div>
          )}

          <ol className="flex-1 overflow-y-auto px-3 py-2">
            {order.lines.length === 0 && (
              <li className="px-3 py-10 text-muted text-lg">
                {live ? 'Go ahead, order out loud. Items appear here as Heard hears them.' : 'Pull up to the speaker to start your order.'}
              </li>
            )}
            {order.lines.map((line) => {
              const tl = ticketLine(line)
              return (
                <li key={`${line.id}-${flash[line.id] ?? 0}`} className="line-in grid grid-cols-[3rem_1fr_auto] gap-3 items-start rounded-xl px-3 py-3">
                  <span className="font-display text-3xl font-bold text-mustard tabular-nums">{line.qty}</span>
                  <div>
                    <div className="font-display text-2xl font-semibold leading-tight">
                      {tl.size && <span className="capitalize">{tl.size} </span>}{tl.name}
                      {tl.forWhom && <span className="text-base font-normal text-muted"> · for {tl.forWhom}</span>}
                    </div>
                    {tl.modifiers.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {tl.modifiers.map((m) => (
                          <span key={m} className={`text-xs font-mono font-semibold rounded px-1.5 py-0.5 ${m.startsWith('NO ') ? 'bg-ketchup text-asphalt' : 'bg-panel-2 text-ink border border-line'}`}>{m}</span>
                        ))}
                      </div>
                    )}
                    {tl.meal && <div className="mt-1 text-sm text-muted">{tl.meal}</div>}
                  </div>
                  <span className="font-mono text-lg tabular-nums text-muted">{formatPrice(priceLine(line))}</span>
                </li>
              )
            })}
          </ol>

          <div className="border-t border-line px-6 py-4 grid grid-cols-[1fr_auto] gap-y-1 font-mono tabular-nums">
            <span className="text-muted">Subtotal</span><span className="text-right">{formatPrice(t.subtotal)}</span>
            <span className="text-muted">Tax</span><span className="text-right">{formatPrice(t.tax)}</span>
            <span className="font-display text-2xl font-bold">Total</span><span className="text-right font-display text-2xl font-bold text-mustard">{formatPrice(t.total)}</span>
          </div>

          {order.submitted && (
            <div className="absolute inset-0 grid place-items-center bg-asphalt/90 text-center p-6">
              <div>
                <div className="text-muted uppercase tracking-widest text-sm">Order</div>
                <div className="font-display text-8xl font-extrabold text-mustard">#{order.submitted.orderNumber}</div>
                <div className="mt-2 font-display text-3xl font-bold">{formatPrice(order.submitted.totalCents)} · please pull forward</div>
                <p className="mt-3 text-muted">{order.submitted.updated ? 'Updated ticket sent to the kitchen.' : 'Sent to the kitchen. Nobody touched a keyboard.'}{live ? ' Forgot something? Just say it.' : ''}</p>
                {!live && <button onClick={start} className="mt-6 rounded-xl bg-mustard text-asphalt font-bold px-6 py-3">Next car</button>}
              </div>
            </div>
          )}
          {crew && !order.submitted && (
            <div className="absolute inset-x-0 top-0 alarm text-asphalt font-display font-bold text-xl text-center py-3">
              A crew member is taking over this order
            </div>
          )}
        </section>

        <HearBothWays
          rows={rows}
          genericPartial={genericPartial}
          heardPartial={partial}
          genericOrder={genericOrder}
          heardOrder={order.lines.map(describeLine)}
          connected={shadowOn && live}
          now={nowTick}
        />
        </div>

        {/* ---- speaker post ---- */}
        <section className="flex flex-col gap-4 min-h-0">
          <div className="rounded-2xl border border-line bg-panel p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-end gap-1 h-10" aria-hidden>
                {Array.from({ length: 12 }).map((_, i) => {
                  const h = live ? Math.min(1, level * 9 * (0.55 + ((i * 7) % 5) / 8)) : 0.2
                  return <span key={i} className={`w-1.5 rounded-full transition-[height] duration-75 ${live ? 'bg-mustard' : 'bg-faint'}`} style={{ height: `${Math.max(12, h * 100)}%` }} />
                })}
              </div>
              <div className="text-sm text-muted leading-tight">
                {live ? 'Speak normally. Background voices and car noise are filtered out.' : 'Chrome recommended. Headphones help.'}
              </div>
            </div>
            <div>
              <div className="text-xs font-mono uppercase tracking-wider text-faint mb-2">Pick a scenario</div>
              <div className="flex flex-wrap gap-1.5">
                {SCENARIOS.map((x) => {
                  const selected = x.id === scenario.id
                  const cls = `rounded-full px-3 py-1 text-sm border ${selected ? 'bg-ink text-asphalt border-ink' : 'border-line text-muted hover:text-ink'}`
                  // The Spanglish script needs the bilingual lane; others need the English one.
                  if (Boolean(x.bilingual) !== Boolean(hearing.bilingual)) {
                    return <Link key={x.id} href={x.bilingual ? '/lane?lang=es' : '/lane'} className={cls}>{x.label}</Link>
                  }
                  return <button key={x.id} onClick={() => setScenarioId(x.id)} className={cls}>{x.label}</button>
                })}
              </div>
              <div className="mt-3 rounded-xl bg-panel-2 border border-line p-3 text-[15px] leading-snug">
                <div className="text-xs font-mono uppercase tracking-wider text-mustard mb-1">Say this</div>
                {scenario.lines.map((l) => <p key={l} className={l.startsWith('“') ? 'text-ink' : 'text-muted text-sm'}>{l}</p>)}
              </div>
            </div>
            {!live ? (
              <button
                onClick={start}
                disabled={status === 'connecting'}
                className="rounded-xl bg-mustard text-asphalt font-display text-2xl font-bold py-4 hover:brightness-110 disabled:opacity-60"
              >
                {status === 'connecting' ? 'Connecting…' : order.submitted ? 'Next car' : 'Pull up to the speaker'}
              </button>
            ) : (
              <button onClick={stop} className="rounded-xl border border-ketchup text-ketchup font-bold py-3 hover:bg-ketchup hover:text-asphalt">
                Drive away (end)
              </button>
            )}
            {!live && <NoiseQR />}
            {error && (
              <div className="rounded-lg border border-ketchup/60 bg-ketchup/10 px-3 py-2 text-sm">
                {error} <Link href="/replay" className="underline text-mustard">Watch a recorded order</Link>
              </div>
            )}
          </div>

          {/* live captions */}
          <div className="flex-1 min-h-[220px] rounded-2xl border border-line bg-panel flex flex-col overflow-hidden">
            <div className="px-5 py-3 border-b border-line text-xs font-mono uppercase tracking-widest text-muted">What Heard heard</div>
            <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-2 text-[15px]">
              {captions.length === 0 && !partial && (
                <p className="text-muted">The conversation appears here. Pick a scenario above, pull up, and say its line.</p>
              )}
              {captions.map((c, i) => (
                <p key={i} className={c.who === 'guest' ? 'text-ink' : 'text-sky'}>
                  <span className="text-xs font-mono uppercase text-faint mr-2">{c.who === 'guest' ? 'you' : 'heard'}</span>
                  {c.text}{c.interrupted && <span className="text-faint"> (cut off)</span>}
                </p>
              ))}
              {agentPartial && <p className="text-sky/70"><span className="text-xs font-mono uppercase text-faint mr-2">heard</span>{agentPartial}</p>}
              {partial && <p className="text-ink/70 italic"><span className="text-xs font-mono uppercase text-faint mr-2 not-italic">you</span>{partial}</p>}
            </div>
          </div>

          {/* how Heard decided: heard -> action -> why */}
          <div className="rounded-2xl border border-line bg-panel overflow-hidden">
            <button onClick={() => setShowHood((v) => !v)} className="w-full flex justify-between px-5 py-3 text-xs font-mono uppercase tracking-widest text-muted">
              <span>How Heard decided</span><span>{showHood ? 'hide' : 'show tool calls'}</span>
            </button>
            <ul className="max-h-64 overflow-y-auto px-5 pb-3 space-y-2.5">
              {decisions.length === 0 && <li className="text-sm text-faint">Every change to the order shows up here with the words it came from and the rule that applied. The AI never writes the order.</li>}
              {decisions.map((d) => (
                <li key={d.id} className="text-sm leading-snug">
                  <div className="text-muted">“{d.heard}”</div>
                  <div className={d.ok ? 'text-pickle' : 'text-ketchup'}>{d.ok ? '→ ' : '✗ '}{d.action}</div>
                  {d.why && <div className="text-xs text-faint font-mono">{d.why}</div>}
                </li>
              ))}
            </ul>
            {showHood && (
              <ul className="max-h-40 overflow-y-auto px-5 pb-3 pt-2 border-t border-line font-mono text-xs space-y-1">
                {tools.length === 0 && <li className="text-faint">Tool calls from the agent show up here.</li>}
                {tools.map((t) => (
                  <li key={t.id} className="flex gap-2">
                    <span className={t.rolledBack ? 'text-mustard' : t.ok ? 'text-pickle' : 'text-ketchup'}>{t.rolledBack ? '↺' : t.ok ? '✓' : '✗'}</span>
                    <span className="text-ink">{t.name}</span>
                    <span className="text-muted truncate">{t.detail}</span>
                  </li>
                ))}
              </ul>
            )}
            {unavailable.length > 0 && (
              <div className="px-5 pb-3 text-xs text-mustard">Kitchen says unavailable: {unavailable.map((id) => MENU_BY_ID[id]?.name ?? id).join(', ')}</div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
