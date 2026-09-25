'use client'

// Live link between the lane (speaker post) and the kitchen screen.
// Uses Supabase Realtime broadcast when configured, so the kitchen can be a
// different device. Without Supabase it falls back to BroadcastChannel, which
// syncs tabs in the same browser — enough for local development.

import { createClient, type RealtimeChannel } from '@supabase/supabase-js'

export interface TicketLine {
  id: string
  qty: number
  name: string
  size?: string
  modifiers: string[]
  meal?: string
  forWhom?: string
}

export interface LaneSnapshot {
  lane: number
  status: 'waiting' | 'ordering' | 'submitted' | 'crew'
  lines: TicketLine[]
  total: string
  heard?: string
  updatedAt: number
}

export interface SubmittedOrder {
  orderNumber: number
  lane: number
  lines: TicketLine[]
  total: string
  sessionId?: string | null
  submittedAt: number
  seconds?: number
}

export type LaneEvents = {
  lane: LaneSnapshot
  order: SubmittedOrder
  availability: { unavailable: string[] }
  crew: { lane: number; reason?: string; at: number }
}

type Handler<K extends keyof LaneEvents> = (payload: LaneEvents[K]) => void

export interface LaneChannel {
  send<K extends keyof LaneEvents>(event: K, payload: LaneEvents[K]): void
  on<K extends keyof LaneEvents>(event: K, handler: Handler<K>): void
  close(): void
  transport: 'supabase' | 'local'
}

const NAME = 'heard-lane'

export function openLaneChannel(): LaneChannel {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const handlers = new Map<string, Set<(p: unknown) => void>>()
  const dispatch = (event: string, payload: unknown) => handlers.get(event)?.forEach((h) => h(payload))
  const on = (event: string, handler: (p: unknown) => void) => {
    if (!handlers.has(event)) handlers.set(event, new Set())
    handlers.get(event)!.add(handler)
  }

  if (url && key) {
    const supabase = createClient(url, key)
    const channel: RealtimeChannel = supabase.channel(NAME, { config: { broadcast: { self: false } } })
    for (const event of ['lane', 'order', 'availability', 'crew']) {
      channel.on('broadcast', { event }, ({ payload }) => dispatch(event, payload))
    }
    channel.subscribe()
    return {
      transport: 'supabase',
      send: (event, payload) => { void channel.send({ type: 'broadcast', event, payload }) },
      on: on as LaneChannel['on'],
      close: () => { void supabase.removeChannel(channel) },
    }
  }

  const bc = new BroadcastChannel(NAME)
  bc.onmessage = (e) => dispatch(e.data.event, e.data.payload)
  return {
    transport: 'local',
    send: (event, payload) => bc.postMessage({ event, payload }),
    on: on as LaneChannel['on'],
    close: () => bc.close(),
  }
}
