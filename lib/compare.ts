// Pairs what the generic transcriber heard with what Heard heard, turn by turn,
// and says whether they mean the same thing to the order.

import { describeLine, emptyOrder, runTool } from './order-engine'
import { parseUtterance } from './order-parser'

export interface Row {
  heard?: string
  heardAt?: number
  generic: string[]
  genericAt?: number
}

/** Both transcribers finalize near the end of speech; this is how far apart counts as "the same turn". */
const WINDOW_MS = 2500

export function addHeard(rows: Row[], text: string, at: number): Row[] {
  const last = rows.at(-1)
  // The generic side finished first: fill in its row, if it's recent.
  if (last && last.heard == null && last.genericAt != null && at - last.genericAt < WINDOW_MS + 1500) {
    return [...rows.slice(0, -1), { ...last, heard: text, heardAt: at }]
  }
  return [...rows, { heard: text, heardAt: at, generic: [] }]
}

export function addGeneric(rows: Row[], text: string, at: number): Row[] {
  const last = rows.at(-1)
  const recent = last && ((last.heardAt != null && at - last.heardAt < WINDOW_MS) || (last.heard == null && last.genericAt != null && at - last.genericAt < WINDOW_MS))
  if (last && recent) return [...rows.slice(0, -1), { ...last, generic: [...last.generic, text], genericAt: at }]
  // Nothing from Heard around this time: the generic side may be hearing someone Heard filtered out.
  return [...rows, { generic: [text], genericAt: at }]
}

/** The items and options a sentence means to the parser, as comparable text. */
export function orderMeaning(text: string): string[] {
  const r = parseUtterance(text, emptyOrder(), null)
  if (!r.changes.length) return []
  const o = runTool(emptyOrder(), 'update_order', { changes: r.changes })
  const added = o.state.lines.map(describeLine)
  // Keep the attempted adds that the engine refused (e.g. no size yet), so they still compare.
  const results = (o.result.results as { ok?: boolean; error?: string }[] | undefined) ?? []
  const refused = r.changes.filter((_, i) => results[i] && !results[i].ok).map((c) => `${c.quantity ?? 1} ${c.item_id}${c.size ? ' ' + c.size : ''}${c.modifiers?.length ? ' ' + c.modifiers.join(' ') : ''}`)
  return [...added, ...refused].sort()
}

export function sameMeaning(a: string, b: string): boolean {
  return JSON.stringify(orderMeaning(a)) === JSON.stringify(orderMeaning(b))
}
