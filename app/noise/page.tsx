import type { Metadata } from 'next'
import NoisePlayer from '@/components/NoisePlayer'

export const metadata: Metadata = { title: 'Drive-thru noise · Heard' }

export default function NoisePage() {
  return (
    <main className="flex-1 w-full max-w-md mx-auto px-5 py-10 flex flex-col gap-6 text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-mustard">Heard · noise maker</p>
      <h1 className="font-display text-4xl font-extrabold leading-tight">Turn your phone into a drive-thru</h1>
      <p className="text-muted">
        Engine rumble, passing cars and kids in the back seat. Play it on this phone, set it about a metre from your laptop, and order on Lane 1 over it.
      </p>
      <NoisePlayer />
      <ul className="text-left text-sm text-muted space-y-2 rounded-2xl border border-line bg-panel p-4">
        <li>• It has to be a second device: browsers cancel out sound the ordering page plays itself.</li>
        <li>• Loud is fine. A busy street is about 70 dB; that&apos;s roughly as loud as your own voice at the laptop.</li>
        <li>• Then try ordering with it off and on. The order should come out the same.</li>
      </ul>
    </main>
  )
}
