import type { Metadata } from 'next'
import Lane from '@/components/Lane'
import type { HearingOptions, VoiceFocus } from '@/lib/agent-config'

export const metadata: Metadata = { title: 'Lane 1 · Heard' }

// Hearing settings come from the URL so the same page can run A/B comparisons:
// /lane?focus=off&keyterms=0 is the "generic STT" baseline.
export default async function LanePage(props: PageProps<'/lane'>) {
  const sp = await props.searchParams
  const focusParam = typeof sp.focus === 'string' ? sp.focus : 'far'
  const voiceFocus: VoiceFocus = focusParam === 'off' ? 'off' : focusParam === 'near' ? 'near-field' : 'far-field'
  const threshold = typeof sp.threshold === 'string' ? Number(sp.threshold) : undefined
  const hearing: HearingOptions = {
    voiceFocus,
    voiceFocusThreshold: threshold != null && threshold >= 0 && threshold <= 1 ? threshold : undefined,
    keyterms: sp.keyterms !== '0',
  }
  return <Lane hearing={hearing} />
}
