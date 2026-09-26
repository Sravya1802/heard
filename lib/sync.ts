// The bridge between the voice agent and the order.
//
// The managed Voice Agent LLM calls simple, parameterless tools. Whatever it
// calls, we first sync the order with everything the guest said since the last
// sync (AssemblyAI's final transcripts), using the deterministic parser. So the
// order is built from what was *heard*, and the model only runs the conversation.

import { describeLine, runTool, type EngineContext, type OrderState, type ToolOutcome } from './order-engine'
import { parseUtterance, type Change, type Pending } from './order-parser'

const NEEDS: Record<string, Extract<Pending, { kind: 'item' }>['missing']> = {
  size_required: 'size',
  flavor_required: 'flavor',
  kids_main_required: 'kids_main',
  meal_drink_required: 'meal_drink',
}

export interface SyncSummary {
  heard: string[]
  changed: string[]
  ask: string[]
  wantsHuman: boolean
  done: boolean
  unmatched: string[]
  negative: boolean
  /** A late add-on reopened an order that was already sent to the kitchen. */
  reopened: boolean
}

/** Apply everything the guest said since the last sync. */
export function syncHeard(state: OrderState, heard: string[], ctx: EngineContext): { state: OrderState; summary: SyncSummary } {
  const summary: SyncSummary = { heard, changed: [], ask: [], wantsHuman: false, done: false, unmatched: [], negative: false, reopened: false }
  let s = state
  for (const utterance of heard) {
    if (!utterance.trim()) continue
    const r = parseUtterance(utterance, s, s.pending)
    summary.wantsHuman ||= Boolean(r.wantsHuman)
    summary.done ||= Boolean(r.done)
    summary.negative ||= Boolean(r.negative)
    if (r.unmatched) summary.unmatched.push(utterance)
    if (!r.changes.length) {
      // An offer only applies to the very next answer. "Thank you" or anything else
      // that doesn't take it closes it, so a later "yes" (to the read-back) can't revive it.
      if (s.pending?.kind === 'offer') s = { ...s, pending: null }
      continue
    }
    if (s.submitted) summary.reopened = true
    const o = runTool(s, 'update_order', { changes: r.changes }, ctx)
    if (o.result.reopened) summary.reopened = true
    s = { ...o.state, pending: null }
    const results = (o.result.results as Record<string, unknown>[] | undefined) ?? [o.result]
    results.forEach((res, i) => {
      if (res.ok) {
        summary.changed.push(String(res.added ? `added ${res.added}` : res.now ? `now ${res.now}` : res.removed ? `removed ${res.removed}` : 'updated'))
      } else {
        summary.ask.push(String(res.message))
        const missing = NEEDS[String(res.error)]
        if (missing && !s.pending) s = { ...s, pending: { kind: 'item', change: r.changes[i] as Change, missing } }
      }
    })
  }
  return { state: s, summary }
}

function syncNote(sum: SyncSummary): string {
  if (sum.wantsHuman) return 'The guest asked for a person. Call request_human now.'
  if (sum.reopened && sum.ask.length) return 'This adds to the order already sent to the kitchen. Ask the question in "ask"; once it is answered, call read_back and then submit_order to update the ticket.'
  if (sum.reopened) return 'This adds to the order already sent to the kitchen. Confirm it in a few words, then call read_back and, when they confirm, submit_order to update the ticket.'
  if (sum.ask.length) return 'Confirm what changed in a few words, then ask the question in `ask`.'
  if (sum.changed.length) return sum.done
    ? 'Confirm briefly. The guest is done ordering: call suggest_upsell next.'
    : 'Confirm what changed in a few words and ask "anything else?".'
  if (sum.unmatched.length) return 'Nothing on our menu matched what they asked for. If they named something we do not sell, say so and suggest the closest item; otherwise ask them to repeat the item name.'
  if (sum.done) return 'No change. The guest is done ordering: call suggest_upsell next.'
  return 'No change to the order. Respond to what they said.'
}

/**
 * Run a tool call from the agent. Every tool first syncs the order with what
 * the guest said, so nothing is lost if the model skips straight to read_back.
 */
export function runAgentTool(state: OrderState, name: string, args: Record<string, unknown>, heard: string[], ctx: EngineContext = {}): ToolOutcome & { summary: SyncSummary } {
  const { state: synced, summary } = syncHeard(state, heard, ctx)

  if (name === 'sync_order') {
    return {
      state: synced,
      ok: true,
      summary,
      result: {
        ok: true,
        changed: summary.changed,
        ...(summary.ask.length ? { ask: summary.ask.join(' ') } : {}),
        order: synced.lines.map((l) => ({ line_id: l.id, text: describeLine(l) })),
        note: syncNote(summary),
      },
    }
  }

  if (summary.wantsHuman && name !== 'request_human') {
    return { state: synced, ok: false, summary, result: { ok: false, error: 'guest_wants_human', message: 'The guest asked for a person. Call request_human now.' } }
  }
  // Never send a ticket while a question is still open ("yes, and a Coke" -> what size?).
  if (name === 'submit_order' && (summary.ask.length || synced.pending?.kind === 'item')) {
    return {
      state: synced, ok: false, summary,
      result: { ok: false, error: 'question_open', message: `Don't submit yet. First ask: ${summary.ask.join(' ') || 'the open question about the last item.'}`, ...(summary.changed.length ? { also_changed: summary.changed } : {}) },
    }
  }

  const o = runTool(synced, name, args, ctx)
  // A pending question from the sync still stands after a read-back or upsell.
  const withPending = o.state.pending ?? synced.pending
  return {
    ...o,
    state: { ...o.state, pending: withPending },
    summary,
    result: {
      ...o.result,
      ...(summary.changed.length ? { also_changed: summary.changed } : {}),
      ...(summary.ask.length ? { ask_first: summary.ask.join(' ') } : {}),
    },
  }
}

/**
 * Safety net for an empty reply (the model produced neither speech nor a tool
 * call). The app syncs the order itself, then asks for a reply with explicit
 * instructions, so a model glitch costs a second, not the order.
 */
export function recoveryInstructions(summary: SyncSummary, state: OrderState): string {
  if (summary.wantsHuman) return 'The guest asked for a person. Say, in one short sentence, that a crew member is joining now.'
  const parts: string[] = []
  if (summary.changed.length) parts.push(`The order was just updated: ${summary.changed.join('; ')}. Confirm that in a few words.`)
  if (summary.ask.length) parts.push(`Then ask: ${summary.ask.join(' ')}`)
  else if (summary.done && !state.upsellOffered) parts.push('The guest is done ordering. Call suggest_upsell.')
  else if (summary.done) parts.push('The guest is done ordering. Call read_back.')
  else if (summary.changed.length) parts.push('Then ask "Anything else?"')
  if (!parts.length) parts.push('Respond to what the guest just said, in one short sentence. Do not call more than one tool.')
  return parts.join(' ')
}
