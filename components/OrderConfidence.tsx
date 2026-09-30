'use client'

import { useEffect } from 'react'

/** A check is waiting, clear (nothing needed), passed, or awaiting the guest's yes. */
export type CheckState = 'wait' | 'clear' | 'ok' | 'pending'

export interface Check {
  key: string
  label: string
  state: CheckState
  /** Short headline value, e.g. "3 applied". */
  value: string
  /** One line of evidence: the words it came from, or what was kept off. */
  detail?: string
  /** The sentence used on the full-screen "order sent" moment, and its evidence if any. */
  moment: string
  momentDetail?: string
}

export interface ConfidenceInput {
  live: boolean
  heardCount: number
  lastHeard?: string
  itemCount: number
  corrections: number
  lastCorrection?: string
  asked: number
  background: number
  capped: number
  unavailable: number
  offMenu: number
  readBack: boolean
  sentNumber?: number
}

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`

/** The five things a judge (or a manager) needs to trust this order. */
export function confidenceChecks(x: ConfidenceInput): Check[] {
  const hasOrder = x.itemCount > 0
  const kept = [
    x.background && plural(x.background, 'background voice'),
    x.capped && plural(x.capped, 'suspicious quantity', 'suspicious quantities'),
    x.unavailable && plural(x.unavailable, 'unavailable item'),
    x.offMenu && plural(x.offMenu, 'off-menu item'),
  ].filter(Boolean) as string[]
  const keptCount = x.background + x.capped + x.unavailable + x.offMenu

  return [
    {
      key: 'heard',
      label: 'Heard you',
      state: x.heardCount ? 'ok' : 'wait',
      value: x.heardCount ? plural(x.heardCount, 'sentence') : x.live ? 'listening…' : 'not yet',
      detail: x.lastHeard ? `“${x.lastHeard}”` : undefined,
      moment: `Heard ${plural(x.heardCount, 'sentence')} from the driver`,
    },
    {
      key: 'order',
      label: 'Order built',
      state: hasOrder ? 'ok' : 'wait',
      value: hasOrder ? plural(x.itemCount, 'item') : 'nothing yet',
      detail: hasOrder ? 'from your words by the parser, not by the AI' : undefined,
      moment: `Built from the driver's own words, not by the AI`,
    },
    {
      key: 'corrections',
      label: 'Corrections',
      state: x.corrections ? 'ok' : hasOrder ? 'clear' : 'wait',
      value: x.corrections ? `${x.corrections} applied` : hasOrder ? 'none needed' : 'none yet',
      detail: x.lastCorrection ? `“${x.lastCorrection}”` : x.asked ? `asked ${plural(x.asked, 'question')} instead of guessing` : undefined,
      moment: x.corrections ? `${plural(x.corrections, 'correction')} applied, in order` : 'No corrections needed',
      momentDetail: x.lastCorrection ? `last one: “${x.lastCorrection}”` : undefined,
    },
    {
      key: 'ignored',
      label: 'Ignored',
      state: keptCount ? 'ok' : hasOrder ? 'clear' : 'wait',
      value: keptCount ? `${keptCount} ignored` : hasOrder ? 'nothing to ignore' : 'none yet',
      detail: kept.length ? kept.join(' · ') : undefined,
      moment: kept.length ? `Ignored ${kept.join(', ')}` : 'Nothing extra slipped onto the order',
    },
    {
      key: 'readback',
      label: 'Read back',
      state: x.sentNumber != null ? 'ok' : x.readBack ? 'pending' : 'wait',
      value: x.sentNumber != null ? 'confirmed' : x.readBack ? 'waiting for “yes”' : 'before sending',
      detail: x.sentNumber != null ? `sent to the kitchen as #${x.sentNumber}` : x.readBack ? 'nothing goes to the kitchen until the guest agrees' : undefined,
      moment: 'Read back and confirmed by the driver',
    },
  ]
}

const MARK: Record<CheckState, string> = { wait: '○', clear: '✓', ok: '✓', pending: '…' }
const TONE: Record<CheckState, string> = {
  wait: 'border-line text-faint',
  clear: 'border-line text-muted',
  ok: 'border-pickle/50 bg-pickle/10 text-pickle',
  pending: 'border-mustard/50 bg-mustard/10 text-mustard',
}

/** Five checks that turn green as the order earns them. */
export default function OrderConfidence({ checks, sent }: { checks: Check[]; sent: boolean }) {
  const passed = checks.filter((c) => c.state === 'ok' || c.state === 'clear').length
  const started = checks.some((c) => c.state !== 'wait')
  return (
    <section className="rounded-2xl border border-line bg-panel overflow-hidden" aria-label="Order confidence">
      <div className="px-5 pt-4 pb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line">
        <h2 className="font-display text-xl font-bold">Order confidence</h2>
        <p className="text-sm text-muted">Every line traces to the driver&apos;s words. Nothing is sent until it&apos;s read back.</p>
        <span className={`ml-auto font-mono text-sm tabular-nums ${sent ? 'text-pickle' : started ? 'text-ink' : 'text-faint'}`}>
          {sent ? '✓ verified · sent' : `${passed}/5 checks`}
        </span>
      </div>
      <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 p-3">
        {checks.map((c, i) => (
          <li
            key={`${c.key}-${c.state}`}
            className={`check-in rounded-xl border px-3 py-2.5 min-w-0 ${TONE[c.state]} ${i === 4 ? 'col-span-2 sm:col-span-1' : ''}`}
          >
            <div className="flex items-center gap-2">
              <span className="font-display text-2xl font-extrabold leading-none" aria-hidden>{MARK[c.state]}</span>
              <span className="text-[11px] font-mono uppercase tracking-wider">{c.label}</span>
            </div>
            <div className={`mt-1.5 font-display text-lg font-bold leading-tight ${c.state === 'wait' ? 'text-faint' : 'text-ink'}`}>{c.value}</div>
            {c.detail && <div className="mt-0.5 text-xs text-muted leading-snug line-clamp-2 break-words">{c.detail}</div>}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Full-screen beat when the order goes to the kitchen: the checks land one by one, then the number. */
export function ConfidenceMoment({ checks, orderNumber, total, updated, onDone }: {
  checks: Check[]; orderNumber: number; total: string; updated?: boolean; onDone: () => void
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 7000)
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone() }
    window.addEventListener('keydown', key)
    return () => { clearTimeout(t); window.removeEventListener('keydown', key) }
  }, [onDone])

  return (
    <div
      role="dialog"
      aria-label={`Order ${orderNumber} verified and sent`}
      onClick={onDone}
      className="fixed inset-0 z-50 grid place-items-center bg-asphalt/90 backdrop-blur-sm p-4 cursor-pointer"
    >
      <div className="w-full max-w-2xl rounded-3xl border border-pickle/40 bg-panel p-6 sm:p-8 shadow-2xl">
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-pickle">Order confidence · 5 of 5</div>
        <ol className="mt-4 space-y-3">
          {checks.map((c, i) => (
            <li key={c.key} className="check-in flex items-start gap-3" style={{ animationDelay: `${150 + i * 350}ms` }}>
              <span className="grid place-items-center size-9 shrink-0 rounded-full bg-pickle text-asphalt font-display text-xl font-extrabold">✓</span>
              <div className="min-w-0">
                <div className="font-display text-xl sm:text-2xl font-bold leading-tight">{c.moment}</div>
                {c.momentDetail && <div className="text-sm text-muted line-clamp-1 break-words">{c.momentDetail}</div>}
              </div>
            </li>
          ))}
        </ol>
        <div className="check-in mt-6 pt-5 border-t border-line flex flex-wrap items-baseline justify-between gap-2" style={{ animationDelay: `${150 + checks.length * 350 + 200}ms` }}>
          <div className="font-display text-5xl sm:text-6xl font-extrabold text-mustard">#{orderNumber}</div>
          <div className="text-right">
            <div className="font-display text-2xl font-bold">{total}</div>
            <div className="text-sm text-muted">{updated ? 'Updated ticket sent to the kitchen' : 'Sent to the kitchen · please pull forward'}</div>
          </div>
        </div>
        <div className="mt-4 text-xs text-faint">Click anywhere to continue</div>
      </div>
    </div>
  )
}
