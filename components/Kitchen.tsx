'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { MENU_BY_ID } from '@/lib/menu'
import { openLaneChannel, type LaneChannel, type LaneSnapshot, type SubmittedOrder, type TicketLine } from '@/lib/realtime'

// Things that actually go down during a shift. The Frostee machine is first for a reason.
const STATIONS = [
  { id: 'frostee', label: 'Frostee machine' },
  { id: 'apple_turnover', label: 'Apple Turnovers' },
  { id: 'onion_rings', label: 'Onion Rings' },
  { id: 'smokestack', label: 'Smokestack BBQ' },
]

function Ticket({ lines }: { lines: TicketLine[] }) {
  return (
    <ul className="space-y-2">
      {lines.map((l) => (
        <li key={l.id}>
          <div className="font-semibold text-lg leading-tight">
            <span className="text-mustard tabular-nums mr-2">{l.qty}×</span>
            {l.size && <span className="uppercase text-sm text-muted mr-1">{l.size}</span>}
            {l.name}
          </div>
          {l.modifiers.map((m) => (
            <div key={m} className={`ml-7 font-mono text-sm font-bold ${m.startsWith('NO ') ? 'text-ketchup' : 'text-ink'}`}>{m}</div>
          ))}
          {l.meal && <div className="ml-7 font-mono text-sm text-sky">{l.meal}</div>}
          {l.forWhom && <div className="ml-7 text-xs text-muted">for {l.forWhom}</div>}
        </li>
      ))}
    </ul>
  )
}

const TRANSPORT = process.env.NEXT_PUBLIC_SUPABASE_URL ? 'supabase' : 'local'

function age(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function Kitchen() {
  const [lane, setLane] = useState<LaneSnapshot | null>(null)
  const [orders, setOrders] = useState<SubmittedOrder[]>([])
  const [bumped, setBumped] = useState<Set<number>>(new Set())
  const [unavailable, setUnavailable] = useState<string[]>([])
  const [crewAlert, setCrewAlert] = useState<{ reason?: string; at: number } | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const channel = useRef<LaneChannel | null>(null)

  useEffect(() => {
    const ch = openLaneChannel()
    channel.current = ch
    ch.on('lane', (snap) => setLane(snap))
    ch.on('order', (o) => setOrders((prev) => [o, ...prev.filter((p) => p.orderNumber !== o.orderNumber)].slice(0, 30)))
    ch.on('availability', ({ unavailable }) => setUnavailable(unavailable))
    ch.on('crew', (c) => setCrewAlert({ reason: c.reason, at: c.at }))
    fetch('/api/orders').then((r) => r.json()).then(({ orders }) => setOrders((prev) => (prev.length ? prev : orders ?? []))).catch(() => {})
    fetch('/api/availability').then((r) => r.json()).then(({ unavailable }) => setUnavailable(unavailable ?? [])).catch(() => {})
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => { ch.close(); clearInterval(t) }
  }, [])

  const toggle = async (id: string) => {
    const next = unavailable.includes(id) ? unavailable.filter((x) => x !== id) : [...unavailable, id]
    setUnavailable(next)
    channel.current?.send('availability', { unavailable: next })
    await fetch('/api/availability', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ unavailable: next }) }).catch(() => {})
  }

  const open = orders.filter((o) => !bumped.has(o.orderNumber))
  const laneActive = lane && lane.status !== 'waiting' && now - lane.updatedAt < 5 * 60_000

  return (
    <main className="flex-1 flex flex-col w-full px-4 sm:px-6 py-4 gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/" className="font-display text-2xl font-extrabold tracking-tight"><span className="text-mustard">STACK</span>HOUSE</Link>
        <span className="text-xs font-mono uppercase tracking-widest text-muted border border-line rounded px-2 py-1">Kitchen display</span>
        <span className="text-xs font-mono text-faint">{TRANSPORT === 'supabase' ? 'live · realtime' : 'live · this browser only'}</span>
        <span className="ml-auto font-mono text-muted tabular-nums" suppressHydrationWarning>{new Date(now).toLocaleTimeString()}</span>
      </header>

      {crewAlert && now - crewAlert.at < 60_000 && (
        <button onClick={() => setCrewAlert(null)} className="alarm rounded-xl text-asphalt text-left px-5 py-4">
          <div className="font-display text-2xl font-bold">Lane 1 · guest asked for a crew member</div>
          <div className="text-sm">{crewAlert.reason ? `Reason: ${crewAlert.reason}. ` : ''}Put on your headset. Tap to dismiss.</div>
        </button>
      )}

      <div className="grid gap-4 lg:grid-cols-[360px_1fr] flex-1 min-h-0">
        <aside className="flex flex-col gap-4">
          {/* the order being taken right now */}
          <section className="rounded-2xl border border-line bg-panel p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-xl font-bold">Lane 1 · now</h2>
              <span className={`text-xs font-mono uppercase rounded px-2 py-0.5 ${laneActive ? 'bg-pickle text-asphalt' : 'bg-panel-2 text-muted'}`}>
                {laneActive ? lane!.status : 'no car'}
              </span>
            </div>
            {laneActive && lane!.lines.length > 0 ? (
              <>
                <Ticket lines={lane!.lines} />
                <div className="mt-3 pt-3 border-t border-line flex justify-between font-mono text-sm">
                  <span className="text-muted">total</span><span>{lane!.total}</span>
                </div>
              </>
            ) : (
              <p className="text-muted text-sm">{laneActive ? 'Car at the speaker. Items appear here as they are ordered.' : 'Waiting for the next car.'}</p>
            )}
            {laneActive && lane!.heard && <p className="mt-3 text-xs text-muted">last heard: “{lane!.heard}”</p>}
          </section>

          {/* stations */}
          <section className="rounded-2xl border border-line bg-panel p-4">
            <h2 className="font-display text-xl font-bold mb-1">Stations</h2>
            <p className="text-xs text-muted mb-3">Mark something down and Heard stops selling it immediately.</p>
            <ul className="space-y-2">
              {STATIONS.map((s) => {
                const down = unavailable.includes(s.id)
                return (
                  <li key={s.id} className="flex items-center justify-between">
                    <span>{s.label}</span>
                    <button onClick={() => toggle(s.id)} className={`w-24 rounded-lg py-1.5 text-sm font-bold ${down ? 'bg-ketchup text-asphalt' : 'bg-panel-2 text-pickle border border-line'}`}>
                      {down ? 'DOWN' : 'OK'}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        </aside>

        {/* tickets */}
        <section className="min-h-0">
          {open.length === 0 ? (
            <div className="h-full min-h-[300px] grid place-items-center rounded-2xl border border-dashed border-line text-muted text-center p-6">
              <div>
                <p className="font-display text-2xl text-ink">No open tickets</p>
                <p className="mt-2 text-sm">Open <Link className="text-mustard underline" href="/lane" target="_blank">Lane 1</Link> in another tab or device and place an order.</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
              {open.map((o) => {
                const waited = now - o.submittedAt
                const tone = waited > 180_000 ? 'border-ketchup' : waited > 90_000 ? 'border-mustard' : 'border-pickle'
                return (
                  <article key={o.orderNumber} className={`line-in rounded-2xl border-2 ${tone} bg-panel flex flex-col`}>
                    <div className="flex items-center justify-between px-4 py-2 border-b border-line">
                      <span className="font-display text-2xl font-extrabold">#{o.orderNumber}</span>
                      <span className="font-mono text-sm text-muted tabular-nums">{age(waited)}</span>
                    </div>
                    <div className="flex-1 p-4"><Ticket lines={o.lines} /></div>
                    <div className="flex items-center justify-between px-4 py-2 border-t border-line text-sm">
                      <span className="text-muted">Lane {o.lane} · {o.total}{o.seconds ? ` · taken in ${o.seconds}s` : ''}</span>
                      <button onClick={() => setBumped((b) => new Set(b).add(o.orderNumber))} className="rounded bg-panel-2 border border-line px-3 py-1 font-bold hover:border-pickle">Bump</button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
          {unavailable.length > 0 && (
            <p className="mt-4 text-sm text-mustard">Not selling right now: {unavailable.map((id) => MENU_BY_ID[id]?.name ?? id).join(', ')}</p>
          )}
        </section>
      </div>
    </main>
  )
}
