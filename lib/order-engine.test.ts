import { describe, expect, it } from 'vitest'
import { emptyOrder, runTool, totals, type OrderState } from './order-engine'

function run(steps: [string, Record<string, unknown>][], ctx = {}) {
  let state: OrderState = emptyOrder()
  let last
  for (const [name, args] of steps) {
    last = runTool(state, name, args, ctx)
    state = last.state
  }
  return { state, last: last! }
}

describe('add_item', () => {
  it('adds a burger with modifiers and prices it', () => {
    const { state, last } = run([['add_item', { item_id: 'stackhouse_double', modifiers: ['no_pickles'] }]])
    expect(last.ok).toBe(true)
    expect(last.result.added).toBe('1 Stackhouse Double, no pickles')
    expect(totals(state).subtotal).toBe(629)
  })

  it('accepts names and aliases instead of ids', () => {
    const { state } = run([['add_item', { item_id: 'nuggets', size: '10 piece' }]])
    expect(state.lines[0]).toMatchObject({ itemId: 'cluck_bites', size: '10pc' })
  })

  it('asks for a size instead of guessing', () => {
    const { state, last } = run([['add_item', { item_id: 'stack_fries' }]])
    expect(last.ok).toBe(false)
    expect(last.result.error).toBe('size_required')
    expect(state.lines).toHaveLength(0)
  })

  it('requires a Frostee flavor', () => {
    const { last } = run([['add_item', { item_id: 'frostee', size: 'large' }]])
    expect(last.result.error).toBe('flavor_required')
  })

  it('rejects modifiers that do not apply', () => {
    const { last } = run([['add_item', { item_id: 'stack_cola', size: 'large', modifiers: ['no_pickles'] }]])
    expect(last.result.error).toBe('modifier_not_allowed')
  })

  it('rejects items that are not on the menu', () => {
    const { last } = run([['add_item', { item_id: 'big mac' }]])
    expect(last.result.error).toBe('not_on_menu')
  })

  it('merges identical lines', () => {
    const { state } = run([
      ['add_item', { item_id: 'stackhouse_single' }],
      ['add_item', { item_id: 'stackhouse_single' }],
    ])
    expect(state.lines).toHaveLength(1)
    expect(state.lines[0].qty).toBe(2)
  })

  it('builds a meal with a drink and prices it', () => {
    const { state, last } = run([['add_item', { item_id: 'cluckwich', as_meal: true, meal_drink_id: 'sweet_tea', meal_size: 'large' }]])
    expect(last.result.added).toBe('1 Cluckwich, as a large meal with Sweet Tea')
    expect(totals(state).subtotal).toBe(549 + 399)
  })

  it('asks which drink for a meal', () => {
    const { last } = run([['add_item', { item_id: 'cluckwich', as_meal: true }]])
    expect(last.result.error).toBe('meal_drink_required')
  })
})

describe('guardrails', () => {
  it('refuses 18,000 waters without adding anything', () => {
    const { state, last } = run([['add_item', { item_id: 'bottled_water', quantity: 18000 }]])
    expect(last.ok).toBe(false)
    expect(last.result.error).toBe('quantity_too_high')
    expect(String(last.result.message)).toContain('18000')
    expect(state.lines).toHaveLength(0)
  })

  it('caps the whole order size', () => {
    const { last } = run([
      ['add_item', { item_id: 'stackhouse_single', quantity: 10 }],
      ['add_item', { item_id: 'stackhouse_double', quantity: 10 }],
      ['add_item', { item_id: 'cluckwich', quantity: 10 }],
    ])
    expect(last.result.error).toBe('order_too_large')
  })

  it('refuses unavailable items and suggests alternatives', () => {
    const { last } = run([['add_item', { item_id: 'frostee', size: 'small', modifiers: ['vanilla'] }]], { unavailable: new Set(['frostee']) })
    expect(last.result.error).toBe('unavailable')
    expect(String(last.result.message)).toContain('Apple Turnover')
  })
})

describe('corrections', () => {
  it('"two doubles... actually make one a single, no pickles"', () => {
    const { state } = run([
      ['add_item', { item_id: 'stackhouse_double', quantity: 2 }],
      ['modify_item', { line_id: 'L1', quantity: 1 }],
      ['add_item', { item_id: 'stackhouse_single', modifiers: ['no_pickles'] }],
    ])
    expect(state.lines.map((l) => [l.itemId, l.qty, l.modifiers])).toEqual([
      ['stackhouse_double', 1, []],
      ['stackhouse_single', 1, ['no_pickles']],
    ])
  })

  it('swaps the item but keeps options that still apply', () => {
    const { state } = run([
      ['add_item', { item_id: 'stackhouse_double', modifiers: ['no_pickles'] }],
      ['modify_item', { line_id: '1', item_id: 'stackhouse_single' }],
    ])
    expect(state.lines[0]).toMatchObject({ itemId: 'stackhouse_single', modifiers: ['no_pickles'] })
  })

  it('quantity 0 removes the line', () => {
    const { state } = run([
      ['add_item', { item_id: 'apple_turnover' }],
      ['modify_item', { line_id: 'L1', quantity: 0 }],
    ])
    expect(state.lines).toHaveLength(0)
  })

  it('explains unknown line ids', () => {
    const { last } = run([['remove_item', { line_id: 'L9' }]])
    expect(last.result.error).toBe('unknown_line')
  })
})

describe('update_order (one call per guest sentence)', () => {
  it('applies a correction and an addition together', () => {
    const { state, last } = run([
      ['update_order', { changes: [{ action: 'add', item_id: 'stackhouse_double', quantity: 2 }] }],
      ['update_order', { changes: [
        { action: 'change', line_id: 'L1', quantity: 1 },
        { action: 'add', item_id: 'stackhouse_single', modifiers: ['no_pickles'] },
      ] }],
    ])
    expect(last.result.ok).toBe(true)
    expect(state.lines.map((l) => [l.itemId, l.qty])).toEqual([['stackhouse_double', 1], ['stackhouse_single', 1]])
  })

  it('keeps the changes that worked and explains the one that did not', () => {
    const { state, last } = run([['update_order', { changes: [
      { item_id: 'stackhouse_double' },
      { item_id: 'stack_fries' },
    ] }]])
    expect(last.ok).toBe(true)
    expect(last.result.ok).toBe(false)
    expect((last.result.results as { error?: string }[])[1].error).toBe('size_required')
    expect(state.lines).toHaveLength(1)
  })

  it('infers change vs add from line_id and handles removals', () => {
    const { state } = run([
      ['update_order', { changes: [{ item_id: 'apple_turnover' }, { item_id: 'cluckwich' }] }],
      ['update_order', { changes: [{ action: 'remove', line_id: 'L1' }, { line_id: 'L2', add_modifiers: ['no_tomato'] }] }],
    ])
    expect(state.lines).toHaveLength(1)
    expect(state.lines[0]).toMatchObject({ itemId: 'cluckwich', modifiers: ['no_tomato'] })
  })

  it('is refused after submission', () => {
    const { state } = run([['add_item', { item_id: 'apple_turnover' }], ['read_back', {}], ['submit_order', {}]])
    expect(runTool(state, 'update_order', { changes: [{ item_id: 'apple_turnover' }] }).result.error).toBe('already_submitted')
  })
})

describe('upsell', () => {
  it('offers a meal first, then never again', () => {
    const first = run([
      ['add_item', { item_id: 'stackhouse_double' }],
      ['suggest_upsell', {}],
    ])
    expect(String(first.last.result.suggestion)).toContain('meal')
    const second = runTool(first.state, 'suggest_upsell', {})
    expect(second.result.suggestion).toBeNull()
  })

  it('offers dessert when the meal is complete', () => {
    const { last } = run([
      ['add_item', { item_id: 'cluckwich', as_meal: true, meal_drink_id: 'stack_cola' }],
      ['suggest_upsell', {}],
    ])
    expect(String(last.result.suggestion)).toContain('Frostee')
  })
})

describe('read back and submit', () => {
  it('requires a read-back of the latest version before submitting', () => {
    const early = run([
      ['add_item', { item_id: 'stackhouse_single' }],
      ['read_back', {}],
      ['add_item', { item_id: 'apple_turnover' }],
      ['submit_order', {}],
    ])
    expect(early.last.result.error).toBe('read_back_required')

    const ok = run([
      ['add_item', { item_id: 'stackhouse_single' }],
      ['read_back', {}],
      ['submit_order', {}],
    ], { nextOrderNumber: () => 142 })
    expect(ok.last.result).toMatchObject({ ok: true, order_number: 142, total: '$4.85' })
  })

  it('locks the order after submission', () => {
    const { state } = run([
      ['add_item', { item_id: 'stackhouse_single' }],
      ['read_back', {}],
      ['submit_order', {}],
    ])
    expect(runTool(state, 'add_item', { item_id: 'apple_turnover' }).result.error).toBe('already_submitted')
  })

  it('reads back with the total including tax', () => {
    const { last } = run([
      ['add_item', { item_id: 'stack_cola', size: 'large', modifiers: ['light ice'] }],
      ['read_back', {}],
    ])
    expect(last.result.say).toBe('1 large Stack Cola, light ice. Your total is $2.69.')
  })
})
