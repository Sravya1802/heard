import type { Metadata } from 'next'
import Link from 'next/link'
import BenchChart, { type BenchCell } from '@/components/BenchChart'
import results from '@/bench/results.json'
import latency from '@/bench/latency.json'

export const metadata: Metadata = { title: 'Insights · Heard' }

interface Detail { ref: string; hyp: string; exact: boolean }
interface Result {
  condition: string; conditionLabel: string; config: string; configLabel: string
  orderAccuracy: number; menuAccuracy: number; wer: number; leaks: string[]; detail: Detail[]
  reps?: number; orderAccuracyRange?: [number, number]
}

const data = results as unknown as {
  ranAt: string; lines: number; menuTerms: number; voices: string[]
  conditions: { id: string; label: string }[]; configs: { id: string; label: string }[]; results: Result[]
}

const pct = (v: number) => `${Math.round(v * 100)}%`

export default function InsightsPage() {
  const rs = data.results
  const find = (condition: string, config: string) => rs.find((r) => r.condition === condition && r.config === config)
  const conditions = data.conditions.filter((c) => rs.some((r) => r.condition === c.id))
  const cells: BenchCell[] = rs.map((r) => ({
    condition: r.condition, conditionLabel: r.conditionLabel, config: r.config, configLabel: r.configLabel,
    orderAccuracy: r.orderAccuracy, menuAccuracy: r.menuAccuracy, wer: r.wer,
    exact: r.detail.filter((d) => d.exact).length, lines: r.detail.length,
    reps: r.reps ?? 1, range: r.orderAccuracyRange ?? [r.orderAccuracy, r.orderAccuracy],
  }))
  const reps = Math.max(...cells.map((c) => c.reps))

  // Headline: the loudest road noise we tested.
  const worst = find('road0', 'generic')
  const heard = find('road0', 'focus')

  // What each setup actually heard, from the realistic "road + back seat" condition.
  const exampleCondition = rs.some((r) => r.condition === 'rush') ? 'rush' : conditions.at(-1)?.id
  const gen = exampleCondition ? find(exampleCondition, 'generic') : undefined
  const foc = exampleCondition ? find(exampleCondition, 'focus') : undefined
  const examples = gen && foc
    ? gen.detail.map((d, i) => ({ ref: d.ref, generic: d.hyp, heard: foc.detail[i]?.hyp ?? '', gOk: d.exact, hOk: foc.detail[i]?.exact }))
        .filter((e) => !e.gOk && e.hOk).slice(0, 4)
    : []

  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-12">
      <header className="flex items-center justify-between">
        <Link href="/" className="font-display text-2xl font-extrabold tracking-tight">Heard<span className="text-mustard">.</span></Link>
        <nav className="flex gap-4 text-sm text-muted">
          <Link href="/lane" className="hover:text-ink">Lane 1</Link>
          <Link href="/kitchen" className="hover:text-ink">Kitchen</Link>
        </nav>
      </header>

      <section>
        <p className="font-mono text-xs uppercase tracking-widest text-mustard mb-3">The noise benchmark</p>
        <h1 className="font-display text-4xl sm:text-5xl font-extrabold leading-tight tracking-tight max-w-3xl">
          Does the order survive the drive-thru?
        </h1>
        <p className="mt-4 text-lg text-muted max-w-3xl">
          {data.lines} real-world order lines, spoken by {data.voices.length} voices with different accents, streamed through AssemblyAI in real time under road noise and back-seat chatter. Every transcript goes through the same parser as the live agent, and we count the orders that come out exactly right.
        </p>
      </section>

      {worst && heard && (
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-panel p-6">
            <div className="text-sm text-muted">Road noise as loud as the driver (0 dB), previous-generation streaming STT</div>
            <div className="mt-2 font-display text-6xl font-extrabold tabular-nums">{pct(worst.orderAccuracy)}</div>
            <div className="text-sm text-muted">of orders exactly right</div>
          </div>
          <div className="rounded-2xl border border-mustard/60 bg-panel p-6">
            <div className="text-sm text-muted">Same audio, Heard: Universal-3.6 Pro + menu key terms + voice focus</div>
            <div className="mt-2 font-display text-6xl font-extrabold tabular-nums text-mustard">{pct(heard.orderAccuracy)}</div>
            <div className="text-sm text-muted">of orders exactly right</div>
          </div>
        </section>
      )}

      <section>
        <h2 className="font-display text-2xl font-bold mb-1">Orders exactly right, by condition</h2>
        <p className="text-sm text-muted mb-5">
          {reps > 1 ? `Each bar is the mean of ${reps} streaming sessions of all ${data.lines} lines.` : `Each bar is one streaming session of all ${data.lines} lines.`} Hover a bar for the range, menu-term accuracy and word error rate.
        </p>
        <div className="rounded-2xl border border-line bg-panel p-5">
          <BenchChart cells={cells} conditions={conditions} configs={data.configs} />
        </div>
        <details className="mt-3 rounded-xl border border-line bg-panel px-4 py-3">
          <summary className="cursor-pointer text-sm text-muted">Show the numbers as a table</summary>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm font-mono tabular-nums">
              <thead className="text-left text-muted">
                <tr><th className="py-1 pr-4 font-normal">Condition</th><th className="py-1 pr-4 font-normal">Setup</th><th className="py-1 pr-4 font-normal">Orders exact{reps > 1 ? ' (range)' : ''}</th><th className="py-1 pr-4 font-normal">Menu terms</th><th className="py-1 font-normal">WER</th></tr>
              </thead>
              <tbody>
                {cells.map((c) => (
                  <tr key={c.condition + c.config} className="border-t border-line">
                    <td className="py-1 pr-4">{c.conditionLabel}</td>
                    <td className="py-1 pr-4">{c.configLabel}</td>
                    <td className="py-1 pr-4">{pct(c.orderAccuracy)}{c.reps > 1 ? ` (${pct(c.range[0])}–${pct(c.range[1])})` : ` (${c.exact}/${c.lines})`}</td>
                    <td className="py-1 pr-4">{(c.menuAccuracy * 100).toFixed(1)}%</td>
                    <td className="py-1">{(c.wer * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-panel p-5">
          <div className="text-sm text-muted">Median reply time</div>
          <div className="mt-1 font-display text-4xl font-extrabold tabular-nums">{(latency.median / 1000).toFixed(2)} s</div>
          <div className="text-xs text-muted mt-1">from the end of the driver&apos;s speech to the agent&apos;s first audio</div>
        </div>
        <div className="rounded-2xl border border-line bg-panel p-5">
          <div className="text-sm text-muted">90th percentile</div>
          <div className="mt-1 font-display text-4xl font-extrabold tabular-nums">{(latency.p90 / 1000).toFixed(2)} s</div>
          <div className="text-xs text-muted mt-1">including turns where the order engine ran</div>
        </div>
        <div className="rounded-2xl border border-line bg-panel p-5">
          <div className="text-sm text-muted">Measured over</div>
          <div className="mt-1 font-display text-4xl font-extrabold tabular-nums">{latency.replies}</div>
          <div className="text-xs text-muted mt-1">replies in {latency.sessions} live Voice Agent API sessions</div>
        </div>
      </section>

      {examples.length > 0 && (
        <section>
          <h2 className="font-display text-2xl font-bold mb-1">What each setup actually heard</h2>
          <p className="text-sm text-muted mb-5">Same audio, road noise plus back-seat chatter. Made-up brand names are exactly what generic speech-to-text gets wrong.</p>
          <div className="grid gap-3">
            {examples.map((e) => (
              <div key={e.ref} className="rounded-2xl border border-line bg-panel p-4 grid gap-1.5 text-sm">
                <div><span className="font-mono text-xs uppercase text-faint mr-2">said</span>{e.ref}</div>
                <div className="text-muted"><span className="font-mono text-xs uppercase text-faint mr-2">generic</span>✗ {e.generic}</div>
                <div><span className="font-mono text-xs uppercase text-faint mr-2">heard</span><span className="text-pickle">✓</span> {e.heard}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-6 md:grid-cols-2 text-sm text-muted">
        <div>
          <h2 className="font-display text-xl font-bold text-ink mb-2">How we measured</h2>
          <ul className="space-y-1.5 list-disc pl-5">
            <li>{data.lines} scripted order lines ({data.menuTerms} menu terms: items, sizes, options, quantities), including corrections like “make that a single instead”.</li>
            <li>Voices: macOS text-to-speech in {data.voices.length} English accents (US, UK, Indian, Australian, South African, Irish).</li>
            <li>Noise is mixed in at a fixed signal-to-noise ratio and keeps running between lines, like a real lane. 0 dB means the noise is as loud as the driver.</li>
            <li>Each session streams in real time through AssemblyAI streaming speech-to-text, the same Universal-3.6 Pro family the Voice Agent API uses.</li>
            <li>“Exactly right” means the order the transcript produces matches, line for line, the order the true sentence produces.</li>
          </ul>
        </div>
        <div>
          <h2 className="font-display text-xl font-bold text-ink mb-2">Limits, honestly</h2>
          <ul className="space-y-1.5 list-disc pl-5">
            <li>Synthetic voices and generated noise, not recordings from a real lane. Real-world numbers will differ.</li>
            <li>{reps > 1 ? `${reps} sessions per cell; the same audio can still score a few points apart run to run, so small differences are within noise.` : 'One session per cell, so small differences (one or two lines) are within noise.'}</li>
            <li>Voice focus did not stop our synthetic back-seat voices from appearing in transcripts. Those words never became order items, because the order is parsed only against the menu.</li>
            <li>Reproduce it: <code className="text-ink">npm run noise && npm run bench</code>. Last run {new Date(data.ranAt).toUTCString()}.</li>
          </ul>
        </div>
      </section>
    </main>
  )
}
