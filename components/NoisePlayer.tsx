'use client'

import { useRef, useState } from 'react'

export default function NoisePlayer() {
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState(1)

  const toggle = () => {
    const a = audio.current
    if (!a) return
    if (a.paused) { void a.play(); setPlaying(true) } else { a.pause(); setPlaying(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <audio ref={audio} src="/noise/drive-thru.m4a" loop preload="auto" onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />
      <button
        onClick={toggle}
        className={`rounded-2xl font-display text-3xl font-bold py-8 ${playing ? 'bg-ketchup text-asphalt' : 'bg-mustard text-asphalt'} hover:brightness-110`}
      >
        {playing ? '■ Stop the noise' : '▶ Start the noise'}
      </button>
      <label className="flex items-center gap-3 text-sm text-muted">
        <span>Volume</span>
        <input
          type="range" min={0} max={1} step={0.05} value={volume}
          onChange={(e) => { const v = Number(e.target.value); setVolume(v); if (audio.current) audio.current.volume = v }}
          className="flex-1 accent-[var(--mustard)]"
        />
        <span className="w-10 text-right font-mono tabular-nums">{Math.round(volume * 100)}%</span>
      </label>
      <p className="text-xs text-faint">On iPhone, turn the ringer switch off silent and use the side buttons for volume.</p>
    </div>
  )
}
