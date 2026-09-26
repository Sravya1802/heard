// Audio helpers for the scripted drive-thru tests and the benchmark (macOS).
// `say` speaks the guest's lines; `afconvert` turns them into 24 kHz mono PCM16.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

export const RATE = 24_000

/** Parse a PCM16 WAV file and return its samples. Walks chunks, since afconvert adds a FLLR chunk. */
export function readWav(path: string): Int16Array {
  const buf = readFileSync(path)
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${path} is not a WAV file`)
  let off = 12
  let channels = 1
  let bits = 16
  let rate = RATE
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const size = buf.readUInt32LE(off + 4)
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(off + 10)
      rate = buf.readUInt32LE(off + 12)
      bits = buf.readUInt16LE(off + 22)
    } else if (id === 'data') {
      if (bits !== 16 || channels !== 1 || rate !== RATE) throw new Error(`${path}: expected 16-bit mono ${RATE} Hz, got ${bits}-bit ${channels}ch ${rate} Hz`)
      const data = buf.subarray(off + 8, off + 8 + size)
      return new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.length))
    }
    off += 8 + size + (size % 2)
  }
  throw new Error(`${path}: no data chunk`)
}

/** Convert any audio file macOS can read into 24 kHz mono PCM16 WAV. */
export function toPcmWav(input: string, output: string) {
  execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${RATE}`, '-c', '1', input, output])
}

/** Speak `text` with a macOS voice and return the samples. Cached by voice and text. */
export function speak(text: string, voice: string, cacheDir: string): Int16Array {
  mkdirSync(cacheDir, { recursive: true })
  const key = createHash('sha1').update(voice + '|' + text).digest('hex').slice(0, 16)
  const wav = join(cacheDir, `${key}.wav`)
  if (!existsSync(wav)) {
    const aiff = join(cacheDir, `${key}.aiff`)
    execFileSync('say', ['-v', voice, '-o', aiff, text])
    toPcmWav(aiff, wav)
  }
  return readWav(wav)
}

/** Mix noise under speech at a target signal-to-noise ratio in dB. The noise loops. */
export function mixAtSnr(speech: Int16Array, noise: Int16Array, snrDb: number): Int16Array {
  const rms = (a: Int16Array) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / Math.max(1, a.length))
  const s = rms(speech)
  const n = rms(noise)
  if (!n) return speech
  const gain = s / (n * Math.pow(10, snrDb / 20))
  const out = new Int16Array(speech.length)
  for (let i = 0; i < speech.length; i++) {
    const v = speech[i] + noise[i % noise.length] * gain
    out[i] = Math.max(-32768, Math.min(32767, Math.round(v)))
  }
  return out
}

export function loadEnv(path = '.env.local') {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
