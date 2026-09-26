// Browser client for the AssemblyAI Voice Agent API.
//
// Audio handling follows the approach of AssemblyAI's voice-agent-starter-js:
// two AudioWorklets that resample themselves (so Safari, which ignores the
// requested sample rate, still sends 24 kHz), and a ring buffer for playback
// that can be emptied instantly on barge-in.
//
// Protocol: https://www.assemblyai.com/docs/voice-agents/voice-agent-api/events-reference

const WIRE_RATE = 24_000
const WS_URL = 'wss://agents.assemblyai.com/v1/ws'

// Batches ~50 ms per message instead of one per 128-frame render quantum.
const CAPTURE_WORKLET = `
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / ${WIRE_RATE};
    this.pos = 0;
    this.prev = 0;
    this.batch = new Int16Array(${WIRE_RATE / 20});
    this.filled = 0;
    this.level = 0;
    this.frames = 0;
  }
  push(v) {
    const s = Math.max(-1, Math.min(1, v));
    this.batch[this.filled++] = s < 0 ? s * 0x8000 : s * 0x7fff;
    if (this.filled === this.batch.length) {
      const out = this.batch.slice(0);
      this.port.postMessage({ pcm: out.buffer, level: this.level }, [out.buffer]);
      this.filled = 0;
    }
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    let sum = 0;
    for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i];
    this.level = Math.sqrt(sum / ch.length);
    if (this.ratio === 1) { for (let i = 0; i < ch.length; i++) this.push(ch[i]); return true; }
    const n = ch.length;
    let pos = this.pos;
    while (pos < n) {
      const i = Math.floor(pos);
      const a = i === 0 ? this.prev : ch[i - 1];
      const b = ch[i];
      this.push(a + (b - a) * (pos - i));
      pos += this.ratio;
    }
    this.pos = pos - n;
    this.prev = ch[n - 1];
    return true;
  }
}
registerProcessor('heard-capture', CaptureProcessor);
`

const PLAYBACK_WORKLET = `
class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ring = new Float32Array(sampleRate * 30);
    this.w = 0; this.r = 0; this.avail = 0;
    this.step = ${WIRE_RATE} / sampleRate;
    this.rsPos = 0; this.rsPrev = 0; this.drained = false;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') { this.w = this.r = this.avail = 0; this.rsPos = this.rsPrev = 0; return; }
      const pcm = new Int16Array(e.data);
      if (!pcm.length) return;
      if (this.drained) { this.rsPrev = 0; this.rsPos = 0; this.drained = false; }
      if (this.step === 1) { for (let i = 0; i < pcm.length; i++) this.put(pcm[i] / 32768); return; }
      const n = pcm.length;
      let pos = this.rsPos;
      while (pos < n) {
        const i = Math.floor(pos);
        const a = i === 0 ? this.rsPrev : pcm[i - 1] / 32768;
        const b = pcm[i] / 32768;
        this.put(a + (b - a) * (pos - i));
        pos += this.step;
      }
      this.rsPos = pos - n;
      this.rsPrev = pcm[n - 1] / 32768;
    };
  }
  put(v) {
    if (this.avail < this.ring.length) { this.ring[this.w] = v; this.w = (this.w + 1) % this.ring.length; this.avail++; }
  }
  process(_inputs, outputs) {
    const out = outputs[0][0];
    for (let i = 0; i < out.length; i++) {
      if (this.avail > 0) { out[i] = this.ring[this.r]; this.r = (this.r + 1) % this.ring.length; this.avail--; }
      else { out[i] = 0; this.drained = true; }
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}
registerProcessor('heard-playback', PlaybackProcessor);
`

export type CallStatus = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'ended' | 'error'

/** What a tool handler returns. `commit` runs only once the result is actually delivered. */
export interface ToolReply {
  result: unknown
  isError?: boolean
  commit?: () => void
}

export interface VoiceCallbacks {
  onStatus?: (status: CallStatus, detail?: string) => void
  onReady?: (sessionId: string) => void
  onUserPartial?: (text: string) => void
  onUserFinal?: (text: string) => void
  onAgentPartial?: (text: string) => void
  onAgentFinal?: (text: string, interrupted: boolean) => void
  onToolCall: (name: string, args: Record<string, unknown>, callId: string) => ToolReply
  /** The agent was interrupted before our tool results were delivered; undo speculative changes. */
  onToolsDiscarded?: () => void
  /** Milliseconds from the end of the guest's speech to the first audio of the reply. */
  onLatency?: (ms: number) => void
  onMicLevel?: (level: number) => void
  /** Every captured 50 ms frame (24 kHz PCM16), for a parallel transcriber. */
  onAudioFrame?: (pcm: ArrayBuffer) => void
  /** Called once with the optional comparison-transcriber token from the token route. */
  onShadowToken?: (token: string) => void
  /**
   * The agent finished a reply with no speech and no tool call. Return
   * instructions for a fresh reply (after syncing the order yourself), or null.
   */
  onEmptyReply?: () => string | null
  onEnded?: (info: { sessionId: string | null; seconds: number }) => void
  onError?: (code: string, message: string) => void
}

export interface StartOptions {
  session: Record<string, unknown>
  deviceId?: string
  tokenUrl?: string
}

type Pending = { callId: string; reply: ToolReply }

/** The server events this client reads. Fields vary by `type`. */
interface ServerEvent {
  type: string
  session_id?: string
  text?: string
  delta?: string
  reply_id?: string
  data?: string
  status?: 'completed' | 'interrupted'
  name?: string
  call_id?: string
  arguments?: Record<string, unknown>
  interrupted?: boolean
  code?: string
  error_code?: string
  message?: string
}

export class VoiceSession {
  private ws: WebSocket | null = null
  private captureCtx: AudioContext | null = null
  private playbackCtx: AudioContext | null = null
  private playback: AudioWorkletNode | null = null
  private mic: MediaStream | null = null
  private ready = false
  private sessionId: string | null = null
  private startedAt = 0
  private pending: Pending[] = []
  // The docs' rule: only send tool.result while the latest reply is done.
  private lastEvent: 'reply.started' | 'reply.done' | 'speech' | null = null
  private speechStoppedAt: number | null = null
  private awaitingFirstAudio = false
  private agentText = ''
  private liveReplyId: string | null = null
  private printedReplyId: string | null = null
  private ended = false
  private replyHadContent = false
  private recoveries = 0
  private readonly onPageHide = () => this.stop()

  constructor(private cb: VoiceCallbacks) {}

  get id() { return this.sessionId }

  async start(opts: StartOptions) {
    this.cb.onStatus?.('connecting')
    const res = await fetch(opts.tokenUrl ?? '/api/token', { method: 'POST' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Could not start a session (${res.status})`)
    }
    const { token, shadowToken } = await res.json()
    if (shadowToken) this.cb.onShadowToken?.(shadowToken)

    // Created inside the click handler so Safari lets them run.
    this.captureCtx = new AudioContext({ sampleRate: WIRE_RATE })
    this.playbackCtx = new AudioContext({ sampleRate: WIRE_RATE })
    await Promise.all([this.captureCtx.resume(), this.playbackCtx.resume()])
    this.playback = await addWorklet(this.playbackCtx, PLAYBACK_WORKLET, 'heard-playback')
    this.playback.connect(this.playbackCtx.destination)

    this.mic = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(opts.deviceId ? { deviceId: opts.deviceId } : {}),
        channelCount: 1,
        // Keeps the agent from hearing itself. Noise handling is left to the
        // server (voice_focus): stacking browser suppression on top hurts accuracy.
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
      },
    })
    const capture = await addWorklet(this.captureCtx, CAPTURE_WORKLET, 'heard-capture')
    this.captureCtx.createMediaStreamSource(this.mic).connect(capture)

    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`)
    this.ws = ws

    capture.port.onmessage = ({ data }) => {
      this.cb.onMicLevel?.(data.level)
      if (!this.ready || ws.readyState !== WebSocket.OPEN) return
      this.cb.onAudioFrame?.(data.pcm)
      ws.send(JSON.stringify({ type: 'input.audio', audio: toBase64(data.pcm) }))
    }

    ws.onopen = () => ws.send(JSON.stringify({ type: 'session.update', session: opts.session }))
    ws.onmessage = (e) => this.handle(JSON.parse(e.data))
    ws.onerror = () => {
      if (!this.ready) this.fail('connection_failed', 'Could not connect to the voice service.')
    }
    ws.onclose = (e) => {
      if (!this.ready && !this.ended) this.fail('connection_closed', e.reason || 'The connection closed before the session started.')
      this.teardown()
    }
    window.addEventListener('pagehide', this.onPageHide)
  }

  /** End cleanly so billing stops and the session record is saved. */
  stop() {
    if (this.ended) return
    this.ended = true
    const ws = this.ws
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'session.end' }))
      setTimeout(() => { if (ws.readyState === WebSocket.OPEN) ws.close() }, 3000)
    } else {
      ws?.close()
    }
    this.teardown()
  }

  private handle(msg: ServerEvent) {
    switch (msg.type) {
      case 'session.ready':
        this.ready = true
        this.sessionId = msg.session_id ?? null
        this.startedAt = Date.now()
        this.lastEvent = 'reply.done'
        this.cb.onReady?.(this.sessionId ?? '')
        this.cb.onStatus?.('listening')
        break

      case 'input.speech.started':
        // Barge-in: stop the agent mid-word.
        this.playback?.port.postMessage('stop')
        this.lastEvent = 'speech'
        this.cb.onStatus?.('listening')
        break

      case 'input.speech.stopped':
        this.speechStoppedAt = performance.now()
        this.awaitingFirstAudio = true
        this.cb.onStatus?.('thinking')
        break

      case 'transcript.user.delta':
        // `text` is the whole utterance so far: replace, don't append.
        this.cb.onUserPartial?.(msg.text ?? '')
        break

      case 'transcript.user':
        this.recoveries = 0
        this.cb.onUserFinal?.(msg.text ?? '')
        break

      case 'reply.started':
        this.lastEvent = 'reply.started'
        this.replyHadContent = false
        break

      case 'reply.audio': {
        if (this.awaitingFirstAudio && this.speechStoppedAt != null) {
          this.cb.onLatency?.(Math.round(performance.now() - this.speechStoppedAt))
          this.awaitingFirstAudio = false
        }
        this.replyHadContent = true
        const bytes = fromBase64(msg.data ?? '')
        this.playback?.port.postMessage(bytes.buffer, [bytes.buffer])
        this.cb.onStatus?.('speaking')
        break
      }

      case 'transcript.agent.delta':
        if (msg.reply_id && msg.reply_id === this.printedReplyId) break
        if (msg.reply_id !== this.liveReplyId) { this.liveReplyId = msg.reply_id ?? null; this.agentText = '' }
        this.agentText = appendDelta(this.agentText, msg.delta ?? '')
        this.cb.onAgentPartial?.(this.agentText)
        break

      case 'transcript.agent':
        this.printedReplyId = msg.reply_id ?? this.printedReplyId
        this.agentText = ''
        this.cb.onAgentFinal?.(msg.text ?? '', Boolean(msg.interrupted))
        break

      case 'tool.call': {
        this.replyHadContent = true
        if (!msg.name || !msg.call_id) break
        const reply = this.cb.onToolCall(msg.name, msg.arguments ?? {}, msg.call_id)
        this.pending.push({ callId: msg.call_id, reply })
        this.flushIfIdle()
        break
      }

      case 'reply.done':
        if (msg.status === 'interrupted') {
          this.playback?.port.postMessage('stop')
          if (this.pending.length) {
            this.pending = []
            this.cb.onToolsDiscarded?.()
          }
        }
        this.lastEvent = 'reply.done'
        this.flushIfIdle()
        // Safety net: an empty reply would leave the guest in silence.
        if (msg.status === 'completed' && !this.replyHadContent && !this.pending.length && this.recoveries < 2) {
          const instructions = this.cb.onEmptyReply?.()
          if (instructions) {
            this.recoveries++
            this.ws?.send(JSON.stringify({ type: 'reply.create', instructions }))
            this.lastEvent = 'reply.started'
            break
          }
        }
        if (!this.pending.length) this.cb.onStatus?.('listening')
        break

      case 'session.ended':
        this.ended = true
        this.ws?.close()
        break

      case 'session.error':
      case 'error': {
        const code = msg.code ?? msg.error_code ?? 'error'
        this.cb.onError?.(code, msg.message ?? 'Something went wrong.')
        break
      }
    }
  }

  private flushIfIdle() {
    if (this.lastEvent !== 'reply.done' || !this.pending.length || this.ws?.readyState !== WebSocket.OPEN) return
    const batch = this.pending
    this.pending = []
    for (const { callId, reply } of batch) {
      this.ws.send(JSON.stringify({
        type: 'tool.result',
        call_id: callId,
        result: JSON.stringify(reply.result),
        is_error: Boolean(reply.isError),
      }))
      reply.commit?.()
    }
  }

  private fail(code: string, message: string) {
    this.cb.onError?.(code, message)
    this.cb.onStatus?.('error', message)
  }

  private teardown() {
    window.removeEventListener('pagehide', this.onPageHide)
    this.playback?.port.postMessage('stop')
    this.mic?.getTracks().forEach((t) => t.stop())
    this.captureCtx?.close().catch(() => {})
    this.playbackCtx?.close().catch(() => {})
    this.captureCtx = this.playbackCtx = null
    this.playback = null
    this.mic = null
    if (this.startedAt) {
      const seconds = Math.round((Date.now() - this.startedAt) / 1000)
      this.startedAt = 0
      this.cb.onEnded?.({ sessionId: this.sessionId, seconds })
      this.cb.onStatus?.('ended')
    }
  }
}

async function addWorklet(ctx: AudioContext, code: string, name: string) {
  const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }))
  try { await ctx.audioWorklet.addModule(url) } finally { URL.revokeObjectURL(url) }
  return new AudioWorkletNode(ctx, name)
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  // Chunked: spreading a large array into fromCharCode overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

function fromBase64(b64: string): Uint8Array {
  const raw = atob(b64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

// Deltas sometimes carry their own leading space and sometimes don't.
const ATTACHES_LEFT = /^[.,!?;:%)\]}…'"’”]/
function appendDelta(text: string, delta: string) {
  if (!delta) return text
  if (!text || /^\s/.test(delta) || /\s$/.test(text) || ATTACHES_LEFT.test(delta)) return text + delta
  return text + ' ' + delta
}
