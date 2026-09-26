'use client'

import { sameMeaning, type Row } from '@/lib/compare'

interface Props {
  rows: Row[]
  genericPartial: string
  heardPartial: string
  genericOrder: string[]
  heardOrder: string[]
  connected: boolean
  now: number
}

/** The same microphone through two ears: a generic setup vs Heard, turn by turn. */
export default function HearBothWays({ rows, genericPartial, heardPartial, genericOrder, heardOrder, connected, now }: Props) {
  const shown = rows.slice(-6)
  const missing = heardOrder.filter((l) => !genericOrder.includes(l))
  const extra = genericOrder.filter((l) => !heardOrder.includes(l))
  const sameOrder = missing.length === 0 && extra.length === 0

  return (
    <section className="rounded-2xl border border-line bg-panel overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-line flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-xl font-bold">Hear it both ways</h2>
        <p className="text-sm text-muted">Same microphone, two ears. Play noise from your phone and watch the difference.</p>
      </div>

      <div className="grid grid-cols-2 text-xs font-mono uppercase tracking-wide border-b border-line">
        <div className="px-4 py-2 text-ketchup/90">Generic speech-to-text<div className="normal-case tracking-normal text-faint font-sans text-[11px] mt-0.5">older model · no menu hints · no voice focus</div></div>
        <div className="px-4 py-2 text-sky border-l border-line">Heard<div className="normal-case tracking-normal text-faint font-sans text-[11px] mt-0.5">Universal-3.6 Pro · menu key terms · voice focus</div></div>
      </div>

      <div className="max-h-72 overflow-y-auto">
        {!connected && !rows.length && (
          <p className="px-4 py-6 text-sm text-muted">Starts when you pull up to the speaker.</p>
        )}
        {connected && !rows.length && !genericPartial && !heardPartial && (
          <p className="px-4 py-6 text-sm text-muted">Say your order. Each sentence appears here as both heard it.</p>
        )}
        {shown.map((r, i) => {
          const generic = r.generic.join(' ')
          const filtered = r.heard == null && r.genericAt != null && now - r.genericAt > 4000
          const differs = r.heard != null && generic !== '' && !sameMeaning(generic, r.heard)
          return (
            <div key={i} className="grid grid-cols-2 border-b border-line/60 text-[15px] leading-snug">
              <div className={`px-4 py-2.5 ${differs ? 'text-ink' : 'text-muted'}`}>
                {generic ? (<>{differs && <span className="text-ketchup font-bold mr-1.5">✗</span>}{generic}</>) : <span className="text-faint">…</span>}
              </div>
              <div className="px-4 py-2.5 border-l border-line">
                {r.heard != null
                  ? (<>{differs && <span className="text-pickle font-bold mr-1.5">✓</span>}{r.heard}</>)
                  : filtered
                    ? <span className="text-faint italic">Not taken as the driver&apos;s order (background)</span>
                    : <span className="text-faint">…</span>}
              </div>
            </div>
          )
        })}
        {(genericPartial || heardPartial) && (
          <div className="grid grid-cols-2 text-[15px] leading-snug italic">
            <div className="px-4 py-2.5 text-muted">{genericPartial}</div>
            <div className="px-4 py-2.5 border-l border-line text-ink/70">{heardPartial}</div>
          </div>
        )}
      </div>

      {(genericOrder.length > 0 || heardOrder.length > 0) && (
        <div className="grid grid-cols-2 border-t border-line bg-panel-2 text-sm">
          <div className="px-4 py-3">
            <div className="text-xs font-mono uppercase text-faint mb-1">Order it would build</div>
            {genericOrder.length ? genericOrder.map((l) => (
              <div key={l} className={heardOrder.includes(l) ? 'text-muted' : 'text-ketchup'}>{heardOrder.includes(l) ? '' : '✗ '}{l}</div>
            )) : <div className="text-faint">nothing it could use</div>}
          </div>
          <div className="px-4 py-3 border-l border-line">
            <div className="text-xs font-mono uppercase text-faint mb-1">Order Heard built</div>
            {heardOrder.map((l) => <div key={l}>{l}</div>)}
          </div>
          <div className={`col-span-2 px-4 py-2 border-t border-line text-sm font-semibold ${sameOrder ? 'text-pickle' : 'text-ketchup'}`}>
            {sameOrder ? '✓ Both would make the same order' : `✗ The generic setup would get ${missing.length + extra.length} line${missing.length + extra.length === 1 ? '' : 's'} of this order wrong`}
          </div>
        </div>
      )}
    </section>
  )
}
