import 'server-only'

// Persistence for submitted orders and kitchen availability.
// Supabase (service role, server-side only) when configured; otherwise an
// in-memory store that lives as long as the dev server process.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { SubmittedOrder } from './realtime'

let client: SupabaseClient | null | undefined

function db(): SupabaseClient | null {
  if (client !== undefined) return client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null
  return client
}

type Memory = { orders: SubmittedOrder[]; unavailable: string[] }
const memory: Memory = ((globalThis as { __heard?: Memory }).__heard ??= { orders: [], unavailable: [] })

export async function saveOrder(order: SubmittedOrder): Promise<void> {
  const supabase = db()
  if (!supabase) {
    memory.orders.unshift(order)
    memory.orders.length = Math.min(memory.orders.length, 200)
    return
  }
  const { error } = await supabase.from('orders').insert({
    order_number: order.orderNumber,
    lane: order.lane,
    lines: order.lines,
    total: order.total,
    session_id: order.sessionId ?? null,
    seconds: order.seconds ?? null,
    submitted_at: new Date(order.submittedAt).toISOString(),
  })
  if (error) throw new Error(error.message)
}

export async function recentOrders(limit = 30): Promise<SubmittedOrder[]> {
  const supabase = db()
  if (!supabase) return memory.orders.slice(0, limit)
  const { data, error } = await supabase
    .from('orders')
    .select('order_number, lane, lines, total, session_id, seconds, submitted_at')
    .order('submitted_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({
    orderNumber: r.order_number,
    lane: r.lane,
    lines: r.lines,
    total: r.total,
    sessionId: r.session_id,
    seconds: r.seconds ?? undefined,
    submittedAt: Date.parse(r.submitted_at),
  }))
}

export async function getUnavailable(): Promise<string[]> {
  const supabase = db()
  if (!supabase) return memory.unavailable
  const { data } = await supabase.from('settings').select('value').eq('key', 'unavailable').maybeSingle()
  return Array.isArray(data?.value) ? data.value : []
}

export async function setUnavailable(ids: string[]): Promise<void> {
  const supabase = db()
  if (!supabase) { memory.unavailable = ids; return }
  const { error } = await supabase.from('settings').upsert({ key: 'unavailable', value: ids })
  if (error) throw new Error(error.message)
}
