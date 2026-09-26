'use client'

import { useState } from 'react'

export interface BenchCell {
  condition: string
  conditionLabel: string
  config: string
  configLabel: string
  orderAccuracy: number
  menuAccuracy: number
  wer: number
  exact: number
  lines: number
}

// Categorical slots 1-4 of the validated reference palette, dark steps
// (validated against this surface: all checks pass, worst adjacent CVD ΔE 8.4).
const SERIES: Record<string, string> = {
  generic: '#3987e5',
  u3: '#d95926',
  menu: '#199e70',
  focus: '#c98500',
}

const pct = (v: number) => `${Math.round(v * 100)}%`

export default function BenchChart({ cells, conditions, configs }: {
  cells: BenchCell[]
  conditions: { id: string; label: string }[]
  configs: { id: string; label: string }[]
}) {
  const [hover, setHover] = useState<{ cell: BenchCell; x: number; y: number } | null>(null)
  const byKey = new Map(cells.map((c) => [`${c.condition}:${c.config}`, c]))

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      {/* legend: always present for multiple series */}
      <ul className="flex flex-wrap gap-x-5 gap-y-2 mb-5 text-sm text-muted">
        {configs.map((k) => (
          <li key={k.id} className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-[3px]" style={{ background: SERIES[k.id] }} aria-hidden />
            <span className={k.id === 'focus' ? 'text-ink font-semibold' : ''}>{k.id === 'focus' ? `Heard: ${k.label}` : k.label}</span>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-[minmax(0,9.5rem)_1fr] sm:grid-cols-[12rem_1fr] gap-x-4">
        {/* axis header */}
        <div />
        <div className="relative h-5 mr-11 text-[11px] font-mono text-faint">
          {[0, 25, 50, 75, 100].map((v) => (
            <span key={v} className="absolute -translate-x-1/2" style={{ left: `${v}%` }}>{v}%</span>
          ))}
        </div>

        {conditions.map((c) => (
          <div key={c.id} className="contents">
            <div className="py-3 pr-2 text-sm text-ink self-center">{c.label}</div>
            <div className="relative py-3 mr-11">
              {/* hairline gridlines */}
              {[0, 25, 50, 75, 100].map((v) => (
                <span key={v} className="absolute top-0 bottom-0 w-px bg-line" style={{ left: `${v}%` }} aria-hidden />
              ))}
              <div className="relative flex flex-col gap-[2px]">
                {configs.map((k) => {
                  const cell = byKey.get(`${c.id}:${k.id}`)
                  if (!cell) return <div key={k.id} className="h-3.5" />
                  const w = Math.max(cell.orderAccuracy * 100, 0.8)
                  return (
                    <div key={k.id} className="relative h-3.5 flex items-center">
                      <button
                        type="button"
                        aria-label={`${c.label}, ${k.label}: ${pct(cell.orderAccuracy)} of orders exactly right`}
                        onMouseEnter={(e) => setHover({ cell, x: e.clientX, y: e.clientY })}
                        onMouseMove={(e) => setHover({ cell, x: e.clientX, y: e.clientY })}
                        onFocus={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover({ cell, x: r.right, y: r.top }) }}
                        onBlur={() => setHover(null)}
                        className="absolute inset-y-[-3px] left-0 right-0 cursor-default"
                        style={{ width: `${Math.max(w, 6)}%` }}
                      />
                      <span className="h-full shrink-0 rounded-r-[4px] pointer-events-none" style={{ width: `${w}%`, background: SERIES[k.id], opacity: hover && hover.cell !== cell ? 0.45 : 1 }} />
                      {/* direct labels only on the two series the story is about, placed past the bar end */}
                      {(k.id === 'focus' || k.id === 'generic') && (
                        <span className={`absolute text-xs font-mono tabular-nums pointer-events-none whitespace-nowrap ${k.id === 'focus' ? 'text-ink font-semibold' : 'text-muted'}`} style={{ left: `calc(${w}% + 6px)` }}>{pct(cell.orderAccuracy)}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {hover && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs shadow-xl"
          style={{ left: Math.min(hover.x + 14, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 240), top: hover.y + 14 }}
        >
          <div className="text-muted">{hover.cell.conditionLabel}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="inline-block w-2.5 h-2.5 rounded-[2px]" style={{ background: SERIES[hover.cell.config] }} />
            <span className="text-ink font-semibold">{hover.cell.configLabel}</span>
          </div>
          <div className="mt-1 font-mono tabular-nums text-ink">{pct(hover.cell.orderAccuracy)} orders exactly right ({hover.cell.exact}/{hover.cell.lines})</div>
          <div className="font-mono tabular-nums text-muted">{(hover.cell.menuAccuracy * 100).toFixed(1)}% menu terms · WER {(hover.cell.wer * 100).toFixed(1)}%</div>
        </div>
      )}
    </div>
  )
}
