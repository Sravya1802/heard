import Link from 'next/link'

const FAILURES = [
  { failure: 'Mishears orders over engine noise and back-seat chatter', fix: 'AssemblyAI voice_focus isolates the driver; menu key terms catch made-up brand names' },
  { failure: 'Guest changes their mind mid-sentence', fix: 'Corrections edit the existing line instead of adding a duplicate' },
  { failure: 'Nine sweet teas instead of one', fix: 'Quantities are parsed deterministically and read back before anything reaches the kitchen' },
  { failure: 'Pranked with 18,000 waters to reach a human', fix: 'A person is one sentence away, and quantity guardrails refuse absurd orders' },
  { failure: 'AI invents items or prices', fix: 'The model never writes the order: a tested parser and engine own every item, price and total' },
]

const STEPS = [
  { n: '1', title: 'Pull up', body: 'Open Lane 1 and allow the microphone. Chrome works best; headphones help.' },
  { n: '2', title: 'Order like a real person', body: '“Two Stackhouse Doubles… actually make one a single, no pickles.” Then try “eighteen thousand waters” or “can I talk to a person?”' },
  { n: '3', title: 'Watch the kitchen', body: 'Open the kitchen screen in a second tab: items appear while you talk, and the ticket fires when you confirm.' },
]

const STACK = [
  'AssemblyAI Voice Agent API: speech-to-text, LLM and voice over one WebSocket, with barge-in',
  'Universal-3.6 Pro streaming with voice_focus, which AssemblyAI lists for drive-thru speakers',
  'Menu key terms and a transcription prompt, so invented names like "Cluckwich" survive',
  'The model runs the conversation; a deterministic parser builds the order from the transcript',
  'A tested order engine owns every item, price and total, with guardrails and read-back',
  'Single-use browser tokens: the API key never reaches the page',
]

export default function Home() {
  return (
    <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col gap-14">
      <header className="flex items-center justify-between">
        <span className="font-display text-2xl font-extrabold tracking-tight">Heard<span className="text-mustard">.</span></span>
        <nav className="flex gap-4 text-sm text-muted">
          <Link href="/lane" className="hover:text-ink">Lane 1</Link>
          <Link href="/kitchen" className="hover:text-ink">Kitchen</Link>
          <Link href="/insights" className="hover:text-ink">Benchmark</Link>
        </nav>
      </header>

      <section className="grid gap-8 lg:grid-cols-[1.3fr_1fr] items-end">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-mustard mb-4">Drive-thru voice AI, built around hearing</p>
          <h1 className="font-display text-5xl sm:text-7xl font-extrabold leading-[0.95] tracking-tight">
            Drive-thru AI didn&apos;t fail because it was dumb. It failed because it couldn&apos;t hear.
          </h1>
          <p className="mt-6 text-lg text-muted max-w-2xl">
            McDonald&apos;s pulled its AI drive-thru from 100+ restaurants after viral misheard orders.{' '}
            Taco Bell slowed its rollout after one caller ordered 18,000 waters just to reach a human.{' '}
            Heard isolates the driver&apos;s voice from engine noise and back-seat chatter, builds the order only from what it heard, and puts a person one sentence away.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Link href="/lane" className="rounded-2xl bg-mustard text-asphalt font-display text-2xl font-bold text-center py-5 hover:brightness-110">
            Pull up to the speaker →
          </Link>
          <Link href="/kitchen" target="_blank" className="rounded-2xl border border-line text-center py-4 font-semibold hover:border-mustard">
            Open the kitchen screen ↗
          </Link>
          <p className="text-xs text-muted text-center">No login. Sessions are capped at 3 minutes.</p>
        </div>
      </section>

      <section>
        <h2 className="font-display text-3xl font-bold mb-5">Try it in 60 seconds</h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-2xl border border-line bg-panel p-5">
              <span className="font-display text-4xl font-extrabold text-mustard">{s.n}</span>
              <h3 className="mt-2 font-display text-xl font-bold">{s.title}</h3>
              <p className="mt-2 text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-muted">
          Want to test the hearing? Play car or traffic noise from your phone next to your laptop and order again. It has to come from a second device: your browser cancels out sound the page plays itself.
        </p>
      </section>

      <section>
        <h2 className="font-display text-3xl font-bold mb-5">Designed from the public failures</h2>
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
        <span>MIT licensed</span>
      </footer>
    </main>
  )
}
