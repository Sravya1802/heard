import Link from 'next/link'
import NoiseQR from '@/components/NoiseQR'
import results from '@/bench/results.json'
import latency from '@/bench/latency.json'

const FAILURES = [
  { failure: 'Mishears orders over engine noise and back-seat chatter', fix: 'AssemblyAI voice focus isolates the driver; menu key terms catch made-up brand names' },
  { failure: 'Guest changes their mind mid-sentence', fix: 'Corrections edit the existing line instead of adding a duplicate' },
  { failure: 'Nine sweet teas instead of one', fix: 'Quantities are parsed deterministically and read back before anything reaches the kitchen' },
  { failure: 'Pranked with 18,000 waters to reach a human', fix: 'A person is one sentence away, and quantity guardrails refuse absurd orders' },
  { failure: 'AI invents items or prices', fix: 'The model never writes the order: a tested parser and engine own every item, price and total' },
]

const STACK = [
  'AssemblyAI Voice Agent API: speech-to-text, LLM and voice over one WebSocket, with barge-in',
  'Universal-3.6 Pro streaming with voice focus, which AssemblyAI lists for drive-thru speakers',
  'Menu key terms and a transcription prompt, so invented names like "Cluckwich" survive',
  'The model runs the conversation; a deterministic parser builds the order from the transcript',
  'A tested order engine owns every item, price and total, with guardrails and read-back',
  'Live side-by-side: the same mic through generic speech-to-text vs Heard, with the order each would build',
  'Bilingual lane: Spanish, English or both in one sentence, answered in the guest\'s language',
  'Single-use browser tokens: the API key never reaches the page',
]

type Cell = { condition: string; config: string; orderAccuracy: number }
const cells = (results as unknown as { results: Cell[] }).results
const at = (condition: string, config: string) => cells.find((c) => c.condition === condition && c.config === config)?.orderAccuracy ?? 0
const pct = (v: number) => `${Math.round(v * 100)}%`
const GENERIC_LOUD = pct(at('road0', 'generic'))
const HEARD_LOUD = pct(at('road0', 'focus'))

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-2xl border border-line bg-panel p-5 flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <span className="font-display text-3xl font-extrabold text-mustard">{n}</span>
        <h3 className="font-display text-lg font-bold">{title}</h3>
      </div>
      <div className="text-sm text-muted flex flex-col gap-3">{children}</div>
    </li>
  )
}

export default function Home() {
  return (
    <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col gap-14">
      <header className="flex items-center justify-between">
        <span className="font-display text-2xl font-extrabold tracking-tight">Heard<span className="text-mustard">.</span></span>
        <nav className="flex gap-4 text-sm text-muted">
          <Link href="/lane" className="hover:text-ink">Lane 1</Link>
          <Link href="/kitchen" className="hover:text-ink">Kitchen</Link>
          <Link href="/insights" className="hover:text-ink">Benchmark</Link>
          <Link href="/replay" className="hover:text-ink">Replay</Link>
        </nav>
      </header>

      <section className="grid gap-8 lg:grid-cols-[1.35fr_1fr] items-end">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-mustard mb-4">Drive-thru voice AI, built around hearing</p>
          <h1 className="font-display text-5xl sm:text-7xl font-extrabold leading-[0.95] tracking-tight">
            The drive-thru AI that doesn&apos;t make up orders.
          </h1>
          <p className="mt-6 text-lg text-muted max-w-2xl">
            Heard turns chaotic drive-thru speech into a verified order, using AssemblyAI voice focus, menu-aware transcription and a deterministic order engine. The AI runs the conversation; it never writes the order.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Link href="/lane" className="rounded-2xl bg-mustard text-asphalt font-display text-2xl font-bold text-center py-5 hover:brightness-110">
            Start the judge demo →
          </Link>
          <Link href="/replay" className="rounded-2xl border border-line text-center py-4 font-semibold hover:border-mustard">
            No mic? Watch a real order ▶
          </Link>
          <p className="text-xs text-muted text-center">No login. Chrome recommended. Sessions are capped at 3 minutes.</p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-mustard/60 bg-panel p-5">
          <div className="font-display text-5xl font-extrabold text-mustard tabular-nums">{HEARD_LOUD}</div>
          <div className="mt-1 text-sm text-muted">of orders exactly right with road noise as loud as the driver. Generic speech-to-text: <span className="text-ink font-semibold">{GENERIC_LOUD}</span>.</div>
          <Link href="/insights" className="mt-2 inline-block text-xs text-mustard underline">See the benchmark</Link>
        </div>
        <div className="rounded-2xl border border-line bg-panel p-5">
          <div className="font-display text-5xl font-extrabold tabular-nums">{(latency.median / 1000).toFixed(2)} s</div>
          <div className="mt-1 text-sm text-muted">median reply time, from the end of the driver&apos;s speech to Heard&apos;s voice, over {latency.replies} live replies.</div>
        </div>
        <div className="rounded-2xl border border-line bg-panel p-5">
          <div className="font-display text-5xl font-extrabold tabular-nums">0</div>
          <div className="mt-1 text-sm text-muted">items or prices written by the AI. A tested parser and order engine build every order from what was actually heard.</div>
        </div>
      </section>

      <section id="judge-demo">
        <h2 className="font-display text-3xl font-bold mb-2">Judge demo, in 2 minutes</h2>
        <p className="text-muted mb-5">Everything below works in the browser. Headphones help, so Heard doesn&apos;t hear itself.</p>
        <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Step n={1} title="Turn your phone into a drive-thru">
            <p>Scan this and press play. Put the phone about a metre from your laptop.</p>
            <NoiseQR />
          </Step>
          <Step n={2} title="Pull up to the speaker">
            <p>Open Lane 1 and allow the microphone.</p>
            <Link href="/lane" className="self-start rounded-lg bg-mustard text-asphalt font-bold px-4 py-2 hover:brightness-110">Open Lane 1 →</Link>
            <Link href="/kitchen" target="_blank" className="self-start text-mustard underline">Also open the kitchen screen ↗</Link>
          </Step>
          <Step n={3} title="Say a messy order, over the noise">
            <p className="rounded-lg bg-panel-2 border border-line p-3 text-ink text-[15px] leading-snug">
              “Two Stackhouse Doubles… actually make one of those a single, no pickles. And a large chocolate Frostee.”
            </p>
            <p>Then try “eighteen thousand waters”, or “can I talk to a person?”</p>
          </Step>
          <Step n={4} title="Watch it hear both ways">
            <p>Under the order board, the same microphone goes through generic speech-to-text and through Heard. Mistakes are marked in red, with the order each would have built.</p>
          </Step>
          <Step n={5} title="Confirm, and watch the kitchen">
            <p>Say “that&apos;s all”, answer the one offer, confirm the read-back. The ticket fires on the kitchen screen. Forgot something? Just say it: the ticket updates.</p>
          </Step>
          <Step n={6} title="Habla español?">
            <p>Switch Lane 1 to “Español + English” and order in Spanish, English or both: “Quiero dos Stackhouse Doubles, una sin pepinillos, y unas papas grandes.”</p>
            <Link href="/lane?lang=es" className="self-start text-mustard underline">Open the bilingual lane →</Link>
          </Step>
        </ol>
      </section>

      <section>
        <h2 className="font-display text-3xl font-bold mb-2">Why the big pilots failed, and what Heard does instead</h2>
        <p className="text-muted mb-5 max-w-3xl">
          McDonald&apos;s pulled its AI drive-thru from 100+ restaurants in 2024 after viral misheard orders. Taco Bell slowed its rollout after a caller ordered 18,000 waters just to reach a human. These were hearing and trust failures, not intelligence failures.
        </p>
        <div className="rounded-2xl border border-line overflow-hidden">
          {FAILURES.map((f, i) => (
            <div key={f.failure} className={`grid gap-2 sm:grid-cols-2 px-5 py-4 ${i % 2 ? 'bg-panel' : 'bg-panel-2'}`}>
              <span className="text-ketchup">✗ {f.failure}</span>
              <span className="text-ink">✓ {f.fix}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="font-display text-3xl font-bold mb-4">How it&apos;s built</h2>
          <ul className="space-y-2 text-muted">
            {STACK.map((s) => <li key={s} className="flex gap-2"><span className="text-mustard">▸</span>{s}</li>)}
          </ul>
        </div>
        <div className="rounded-2xl border border-line bg-panel p-5 font-mono text-sm leading-relaxed">
          <p className="text-faint"># AssemblyAI hears the driver</p>
          <p>transcript.user <span className="text-sky">&quot;2 Stackhouse Doubles… actually make one of those a single, no pickles&quot;</span></p>
          <p className="text-faint mt-3"># the model only decides it&apos;s time to update the order</p>
          <p>tool.call sync_order {'{}'}</p>
          <p className="text-faint mt-3"># the parser and engine decide what it means and what it costs</p>
          <p className="text-pickle">✓ now 1 Stackhouse Double · added 1 Stackhouse Single, <span className="text-ketchup">no pickles</span></p>
          <p className="text-faint mt-3"># and they say no when they should</p>
          <p className="text-ketchup">✗ quantity_too_high: asked for 18000 Bottled Water</p>
        </div>
      </section>

      <footer className="border-t border-line pt-6 text-sm text-faint flex flex-wrap gap-x-6 gap-y-2">
        <span>Heard · built for the AssemblyAI Voice Agent Hackathon on lablab.ai</span>
        <span>Stackhouse Burgers is a fictional restaurant.</span>
        <a href="https://github.com/Sravya1802/heard" className="underline hover:text-ink">Source on GitHub (MIT)</a>
      </footer>
    </main>
  )
}
