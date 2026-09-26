// "Hear it both ways": the same microphone audio, streamed in parallel to a
// generic speech-to-text setup (an older AssemblyAI streaming model with no menu
// hints and no voice focus), so the lane can show what a typical drive-thru AI
// would have heard next to what Heard heard.
//
// Protocol: https://www.assemblyai.com/docs/streaming/getting-started/transcribe-streaming-audio

const RATE = 24_000

export const SHADOW_MODEL = 'universal-streaming-english'

export interface ShadowCallbacks {
  onPartial?: (text: string) => void
  onFinal?: (text: string) => void
  onError?: (message: string) => void
}

export class ShadowTranscriber {
  private ws: WebSocket | null = null
  private open = false
  private closed = false

  constructor(private cb: ShadowCallbacks) {}

  start(token: string) {
    const params = new URLSearchParams({
      sample_rate: String(RATE),
      encoding: 'pcm_s16le',
      speech_model: SHADOW_MODEL,
      format_turns: 'true',
      token,
    })
    const ws = new WebSocket(`wss://streaming.assemblyai.com/v3/ws?${params}`)
    this.ws = ws
    ws.onopen = () => { this.open = true }
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data))
      if (m.type !== 'Turn') return
      const text = String(m.transcript ?? '').trim()
      if (!text) return
      // Final once the turn has ended and been formatted; partials before that.
      if (m.end_of_turn && m.turn_is_formatted) this.cb.onFinal?.(text)
      else if (!m.end_of_turn) this.cb.onPartial?.(text)
    }
    ws.onerror = () => { if (!this.closed) this.cb.onError?.('The comparison transcriber could not connect.') }
    ws.onclose = () => { this.open = false }
  }

  /** 16-bit PCM at 24 kHz, the same frames the voice agent receives. */
  send(pcm: ArrayBuffer) {
    if (this.open && this.ws?.readyState === WebSocket.OPEN) this.ws.send(pcm)
  }

  stop() {
    if (this.closed) return
    this.closed = true
    const ws = this.ws
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'Terminate' }))
      setTimeout(() => { if (ws.readyState === WebSocket.OPEN) ws.close() }, 2000)
    } else {
      ws?.close()
    }
  }
}
