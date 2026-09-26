'use client'

import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

/** QR code that opens the noise maker on a phone. NEXT_PUBLIC_NOISE_URL overrides it (e.g. a LAN address in local testing). */
export default function NoiseQR() {
  const [svg, setSvg] = useState<string | null>(null)
  const [url, setUrl] = useState('')

  useEffect(() => {
    const target = process.env.NEXT_PUBLIC_NOISE_URL || `${window.location.origin}/noise`
    QRCode.toString(target, { type: 'svg', margin: 1, color: { dark: '#0c0c0d', light: '#f4f1ea' } })
      .then((s) => { setSvg(s); setUrl(target) })
      .catch(() => {})
  }, [])

  if (!svg) return null
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-panel-2 p-3">
      <div className="w-20 h-20 shrink-0 rounded-md overflow-hidden" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="text-sm leading-snug">
        <div className="font-semibold">Test the hearing</div>
        <div className="text-muted">Scan with your phone to play drive-thru noise, set it next to your laptop, then order over it.</div>
        <a href={url} target="_blank" className="text-xs text-mustard underline break-all">{url.replace(/^https?:\/\//, '')}</a>
      </div>
    </div>
  )
}
