'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

type Event =
  | { t: number; kind: 'guest'; text: string }
  | { t: number; kind: 'agent'; text: string; end: number }
  | { t: number; kind: 'tool'; name: string; changed: string[]; ask?: string; error?: string }
  | { t: number; kind: 'order'; lines: string[]; total?: string; submitted?: number; crew?: boolean }

interface Replay { id: string; title: string; duration: number; recordedAt: string; events: Event[] }

/** "1 Stackhouse Single, no pickles, as a large meal with Sweet Tea (for my daughter)" -> parts for the board. */
function splitLine(text: string) {
  const m = text.match(/^(\d+) (.+)$/)
  const qty = m ? m[1] : ''
  let rest = m ? m[2] : text
  const who = rest.match(/ \(for (.+)\)$/)
  if (who) rest = rest.slice(0, who.index)
  const parts = rest.split(', ')
  const raw = parts.shift() ?? ''
  const name = raw.charAt(0).toUpperCase() + raw.slice(1)
  const meal = parts.find((p) => p.startsWith('as a '))
  const mods = parts.filter((p) => p !== meal)
  return { qty, name, mods, meal: meal?.replace(/^as a /, ''), forWhom: who?.[1] }
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export default function ReplayPlayer({ id }: { id: string }) {
  const [replay, setReplay] = useState<Replay | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const audio = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    fetch(`/replays/${id}/events.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error('not found'))))
      .then((r: Replay) => {
        setReplay(r)
        // ?t=40 opens the replay at that second (handy for sharing a moment).
        const start = Number(new URLSearchParams(window.location.search).get('t'))
        if (start > 0) { setT(start); if (audio.current) audio.current.currentTime = start }
      })
      .catch(() => setError('This recording is not available.'))
  }, [id])

  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = () => { setT(audio.current?.currentTime ?? 0); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const shown = useMemo(() => (replay?.events ?? []).filter((e) => e.t <= t), [replay, t])
  const order = [...shown].reverse().find((e): e is Extract<Event, { kind: 'order' }> => e.kind === 'order')
  const total = [...shown].reverse().find((e): e is Extract<Event, { kind: 'order' }> => e.kind === 'order' && Boolean(e.total))?.total
  const submitted = shown.find((e): e is Extract<Event, { kind: 'order' }> => e.kind === 'order' && e.submitted != null)?.submitted
  const crew = shown.some((e) => e.kind === 'order' && e.crew)
  const captions = shown.filter((e) => e.kind === 'guest' || e.kind === 'agent').slice(-8)
  const tools = shown.filter((e): e is Extract<Event, { kind: 'tool' }> => e.kind === 'tool').slice(-8).reverse()

  const toggle = () => {
    const a = audio.current
    if (!a) return
    if (a.paused) { void a.play(); setPlaying(true) } else { a.pause(); setPlaying(false) }
  }

  if (error) return <p className="text-muted">{error} <Link href="/lane" className="text-mustard underline">Try the live lane</Link></p>
  if (!replay) return <p className="text-muted">Loading the recording…</p>
  const duration = replay.duration || 1

  return (
    <div className="flex flex-col gap-4">
      <audio ref={audio} src={`/replays/${id}/audio.m4a`} preload="auto" onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} />

      <div className="rounded-2xl border border-line bg-panel p-4 flex flex-wrap items-center gap-4">
        <button onClick={toggle} className="rounded-xl bg-mustard text-asphalt font-display text-xl font-bold px-6 py-3 hover:brightness-110">
          {playing ? 'Pause' : t > 0 ? 'Resume' : '▶ Play the order'}
        </button>
        <div className="flex-1 min-w-[200px]">
          <input
            type="range" min={0} max={duration} step={0.1} value={Math.min(t, duration)}
            onChange={(e) => { const v = Number(e.target.value); if (audio.current) audio.current.currentTime = v; setT(v) }}
            className="w-full accent-[var(--mustard)]" aria-label="Seek"
          />
          <div className="flex justify-between text-xs font-mono text-muted tabular-nums"><span>{clock(t)}</span><span>{clock(duration)}</span></div>
        </div>
        <div className="text-xs text-muted max-w-xs">
          Real AssemblyAI Voice Agent session, recorded {new Date(replay.recordedAt).toLocaleString()}. Driver on the left channel, Heard on the right.
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="relative rounded-2xl border border-line bg-panel overflow-hidden min-h-[320px] flex flex-col">
          <div className="px-6 pt-5 pb-3 border-b border-line flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-bold">The order</h2>
            {total && <span className="font-display text-2xl font-bold text-mustard">{total}</span>}
          </div>
          <ol className="flex-1 px-3 py-2">
            {!order?.lines.length && <li className="px-3 py-8 text-muted">Items appear here as Heard hears them.</li>}
            {order?.lines.map((line, i) => {
              const p = splitLine(line)
              return (
                <li key={line + i} className="line-in grid grid-cols-[2.5rem_1fr] gap-3 rounded-xl px-3 py-2.5">
                  <span className="font-display text-2xl font-bold text-mustard tabular-nums">{p.qty}</span>
                  <div>
                    <div className="font-display text-xl font-semibold">{p.name}{p.forWhom && <span className="text-sm font-normal text-muted"> · for {p.forWhom}</span>}</div>
                    {p.mods.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {p.mods.map((m) => <span key={m} className={`text-xs font-mono font-semibold uppercase rounded px-1.5 py-0.5 ${m.startsWith('no ') ? 'bg-ketchup text-asphalt' : 'bg-panel-2 border border-line'}`}>{m}</span>)}
                      </div>
                    )}
                    {p.meal && <div className="mt-1 text-sm text-muted">{p.meal}</div>}
                  </div>
                </li>
              )
            })}
          </ol>
          {submitted != null && (
            <div className="absolute inset-x-0 bottom-0 bg-pickle text-asphalt text-center font-display font-bold py-2">Order #{submitted} sent to the kitchen</div>
          )}
          {crew && <div className="absolute inset-x-0 top-0 alarm text-asphalt text-center font-display font-bold py-2">Crew member taking over</div>}
        </section>

        <section className="flex flex-col gap-4 min-w-0">
          <div className="rounded-2xl border border-line bg-panel flex-1 min-h-[200px]">
            <div className="px-5 py-3 border-b border-line text-xs font-mono uppercase tracking-widest text-muted">What Heard heard</div>
            <div className="px-5 py-3 flex flex-col gap-2 text-[15px]">
              {captions.length === 0 && <p className="text-muted">Press play.</p>}
              {captions.map((c, i) => (
                <p key={i} className={c.kind === 'guest' ? 'text-ink' : 'text-sky'}>
                  <span className="text-xs font-mono uppercase text-faint mr-2">{c.kind === 'guest' ? 'driver' : 'heard'}</span>{c.text}
                </p>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-panel">
            <div className="px-5 py-3 border-b border-line text-xs font-mono uppercase tracking-widest text-muted">Under the hood · order engine</div>
            <ul className="px-5 py-3 font-mono text-xs space-y-1 min-h-[80px]">
              {tools.length === 0 && <li className="text-faint">Tool calls appear here.</li>}
              {tools.map((x, i) => (
                <li key={i} className="flex gap-2">
                  <span className={x.error ? 'text-ketchup' : 'text-pickle'}>{x.error ? '✗' : '✓'}</span>
                  <span className="text-ink">{x.name}</span>
                  <span className="text-muted break-words min-w-0">{[x.changed.join('; '), x.ask && `asks: ${x.ask}`, x.error].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  )
}
