// Pairs what the generic transcriber heard with what Heard heard, turn by turn,
// and says whether they mean the same thing to the order.

import { describeLine, emptyOrder } from './order-engine'
import { syncHeard } from './sync'

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
  // The same clause-by-clause sync the live agent uses, on an empty order.
  const { state, summary } = syncHeard(emptyOrder(), [text], {})
  // Keep refused adds (e.g. no size yet), so they still compare.
  const refused = summary.explain.filter((e) => !e.ok).map((e) => `${e.item ?? 'unknown'} ${e.action}`)
  return [...state.lines.map(describeLine), ...refused].sort()
}

export function sameMeaning(a: string, b: string): boolean {
  return JSON.stringify(orderMeaning(a)) === JSON.stringify(orderMeaning(b))
}

const NUM: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', twenty: '20', a: '1', an: '1' }
const normWord = (w: string) => { const n = w.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, ''); return NUM[n] ?? n }

export interface Part { text: string; same: boolean }

/** Word-level alignment of two transcripts (longest common subsequence), for red/green highlighting. */
export function diffWords(a: string, b: string): { a: Part[]; b: Part[] } {
  const A = a.split(/\s+/).filter(Boolean), B = b.split(/\s+/).filter(Boolean)
  const na = A.map(normWord), nb = B.map(normWord)
  const L = Array.from({ length: A.length + 1 }, () => new Array<number>(B.length + 1).fill(0))
  for (let i = A.length - 1; i >= 0; i--)
    for (let j = B.length - 1; j >= 0; j--)
      L[i][j] = na[i] && na[i] === nb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const sameA = new Array<boolean>(A.length).fill(false), sameB = new Array<boolean>(B.length).fill(false)
  let i = 0, j = 0
  while (i < A.length && j < B.length) {
    if (na[i] && na[i] === nb[j]) { sameA[i] = sameB[j] = true; i++; j++ }
    else if (L[i + 1][j] >= L[i][j + 1]) i++
    else j++
  }
  // Words that are only punctuation or filler ("a" vs "an") never count as mistakes.
  return {
    a: A.map((text, k) => ({ text, same: sameA[k] || !na[k] })),
    b: B.map((text, k) => ({ text, same: sameB[k] || !nb[k] })),
  }
}
