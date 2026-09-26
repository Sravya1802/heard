import { describe, expect, it } from 'vitest'
import { describeLine, emptyOrder, type OrderState } from './order-engine'
import { runAgentTool } from './sync'

/** Replays a conversation: each step is what the guest said, then the tool the agent called. */
function conversation(steps: [string | null, string][], orderNumber = 489) {
  let s: OrderState = emptyOrder()
  const results: Record<string, unknown>[] = []
  for (const [said, tool] of steps) {
    const o = runAgentTool(s, tool, {}, said ? [said] : [], { nextOrderNumber: () => orderNumber })
    s = o.state
    results.push(o.result)
  }
  return { state: s, results, lines: s.lines.map(describeLine) }
}

describe('a real conversation from live testing', () => {
  it('"thank you" to an offer, then "yes" to the read-back, does not revive the offer', () => {
    const { state, results, lines } = conversation([
      ['Can I get eighteen thousand waters?', 'sync_order'],
      ['Can I get some fries?', 'sync_order'],
      ['Large.', 'sync_order'],
      ["Yes, that's it.", 'suggest_upsell'],
      ['Thank you.', 'read_back'],
      ['Yes, thank you.', 'submit_order'],
    ])
    expect(lines).toEqual(['1 large Stack Fries'])
    expect(results.at(-1)).toMatchObject({ ok: true, order_number: 489 })
    expect(results.at(-1)).not.toHaveProperty('ask_first')
    expect(state.submitted).not.toBeNull()
  })

  it('"oh, and a cola" after the total reopens the order and re-sends the same ticket', () => {
    const { state, results, lines } = conversation([
      ['Can I get some large fries?', 'sync_order'],
      ["That's it.", 'suggest_upsell'],
      ['No thanks.', 'read_back'],
      ['Yes.', 'submit_order'],
      ['Can you also add me a sweet cola?', 'sync_order'],
      ['Large.', 'sync_order'],
      [null, 'read_back'],
      ['Yes.', 'submit_order'],
    ])
    expect(results[4]).toMatchObject({ ask: expect.stringContaining('Stack Cola') })
    expect(String(results[4].note)).toContain('already sent')
    expect(lines).toEqual(['1 large Stack Fries', '1 large Stack Cola'])
    expect(results.at(-1)).toMatchObject({ ok: true, order_number: 489, updated: true })
    expect(state.submitted?.updated).toBe(true)
  })

  it('will not submit while a question is open', () => {
    const { results } = conversation([
      ['A Cluckwich.', 'sync_order'],
      [null, 'read_back'],
      ['Yes, and a Coke.', 'submit_order'],
    ])
    expect(results.at(-1)).toMatchObject({ ok: false, error: 'question_open' })
  })

  it('an offer taken right away still works', () => {
    const { lines } = conversation([
      ['A Stackhouse Double.', 'sync_order'],
      ["That's all.", 'suggest_upsell'],
      ['Sure, with a Sweet Tea.', 'sync_order'],
    ])
    expect(lines).toEqual(['1 Stackhouse Double, as a medium meal with Sweet Tea'])
  })
})
