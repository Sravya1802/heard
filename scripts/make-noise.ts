// Builds the benchmark's noise beds, deterministically (seeded):
//   bench/noise/road.wav      engine idle rumble, tyre and wind hiss, passing cars
//   bench/noise/backseat.wav  kids and passengers talking from further back in the car
//
//   npm run noise
//
// You can also drop in real recordings (any format macOS reads) with:
//   npx tsx scripts/make-noise.ts --import path/to/traffic.m4a road-real

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BACKSEAT_LINES, BACKSEAT_VOICES } from '../bench/testset'
import { RATE, readWav, speak, toPcmWav } from './audio'

const OUT = join('bench', 'noise')
const SECONDS = 60

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function writeWav(path: string, samples: Float32Array) {
  let peak = 0
  for (const v of samples) peak = Math.max(peak, Math.abs(v))
  const scale = peak ? 0.6 / peak : 1
  const pcm = Buffer.alloc(samples.length * 2)
  samples.forEach((v, i) => pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v * scale)) * 32767), i * 2))
  const header = Buffer.alloc(44)
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8)
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22)
  header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34)
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40)
  writeFileSync(path, Buffer.concat([header, pcm]))
}

function road(): Float32Array {
  const n = RATE * SECONDS
  const out = new Float32Array(n)
  const rand = rng(7)
  let brown = 0
  let hiss = 0
  // Passing cars: a swell of low-passed noise every 6–11 seconds.
  const cars: { at: number; len: number; gain: number }[] = []
  for (let t = 2; t < SECONDS; t += 6 + rand() * 5) cars.push({ at: t * RATE, len: (2 + rand() * 2) * RATE, gain: 0.6 + rand() * 0.8 })
  let whoosh = 0
  for (let i = 0; i < n; i++) {
    const t = i / RATE
    const white = rand() * 2 - 1
    brown = 0.985 * brown + 0.06 * white
    hiss = 0.6 * hiss + 0.4 * white
    const rpm = 1 + 0.08 * Math.sin(2 * Math.PI * 0.4 * t)
    const engine = 0.5 * Math.sin(2 * Math.PI * 31 * rpm * t) + 0.3 * Math.sin(2 * Math.PI * 62 * rpm * t) + 0.15 * Math.sin(2 * Math.PI * 93 * rpm * t)
    whoosh = 0.97 * whoosh + 0.03 * white
    let carEnv = 0
    for (const c of cars) {
      const x = (i - c.at) / c.len
      if (x > -1 && x < 1) carEnv += c.gain * Math.exp(-8 * x * x)
    }
    out[i] = 0.9 * brown + 0.35 * engine * (0.8 + 0.2 * Math.sin(2 * Math.PI * 1.3 * t)) + 0.05 * hiss + 2.2 * whoosh * carEnv
  }
  return out
}

function backseat(): Float32Array {
  const n = RATE * SECONDS
  const out = new Float32Array(n)
  const rand = rng(11)
  const cache = join('bench', '.cache', 'tts')
  let pos = Math.round(0.5 * RATE)
  let k = 0
  while (pos < n) {
    const line = BACKSEAT_LINES[k % BACKSEAT_LINES.length]
    const voice = BACKSEAT_VOICES[k % BACKSEAT_VOICES.length]
    const pcm = speak(line.text, voice, cache)
    for (let i = 0; i < pcm.length && pos + i < n; i++) out[pos + i] += pcm[i] / 32768
    pos += pcm.length + Math.round((0.6 + rand() * 1.4) * RATE)
    k++
  }
  // Further from the mic than the driver: duller (one-pole low-pass) and a little roomy (early reflections).
  const lp = new Float32Array(n)
  let y = 0
  for (let i = 0; i < n; i++) { y += 0.35 * (out[i] - y); lp[i] = y }
  const room = new Float32Array(n)
  const taps = [[0, 1], [Math.round(0.019 * RATE), 0.35], [Math.round(0.037 * RATE), 0.22], [Math.round(0.061 * RATE), 0.12]]
  for (let i = 0; i < n; i++) for (const [d, g] of taps) if (i - d >= 0) room[i] += g * lp[i - d]
  return room
}

mkdirSync(OUT, { recursive: true })
const importIdx = process.argv.indexOf('--import')
if (importIdx > 0) {
  const [src, name] = [process.argv[importIdx + 1], process.argv[importIdx + 2] ?? 'real']
  const dst = join(OUT, `${name}.wav`)
  toPcmWav(src, dst)
  console.log(`imported ${src} → ${dst} (${(readWav(dst).length / RATE).toFixed(1)} s)`)
} else {
  writeWav(join(OUT, 'road.wav'), road())
  writeWav(join(OUT, 'backseat.wav'), backseat())
  console.log(`wrote ${OUT}/road.wav and ${OUT}/backseat.wav (${SECONDS} s each)`)
}
