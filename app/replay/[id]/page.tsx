import type { Metadata } from 'next'
import Link from 'next/link'
import ReplayPlayer from '@/components/ReplayPlayer'

export const metadata: Metadata = { title: 'Replay · Heard' }

export default async function ReplayPage(props: PageProps<'/replay/[id]'>) {
  const { id } = await props.params
  return (
    <main className="flex-1 w-full max-w-[1300px] mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-4">
        <Link href="/" className="font-display text-2xl font-extrabold tracking-tight"><span className="text-mustard">STACK</span>HOUSE</Link>
        <span className="text-xs font-mono uppercase tracking-widest text-muted border border-line rounded px-2 py-1">Recorded order</span>
        <nav className="ml-auto flex gap-4 text-sm text-muted">
          <Link href="/lane" className="hover:text-ink">Try it live</Link>
          <Link href="/insights" className="hover:text-ink">Benchmark</Link>
        </nav>
      </header>
      <ReplayPlayer id={id} />
    </main>
  )
}
