import { describe, expect, it } from 'vitest'
import { parseUtterance, type Pending } from './order-parser'
import { describeLine, emptyOrder, runTool, type OrderState } from './order-engine'

/** Speak each line to the parser, apply its changes with the engine, return the order as text. */
function order(lines: string[], start: OrderState = emptyOrder(), pending: Pending | null = null) {
  let s = start
  for (const line of lines) {
    const r = parseUtterance(line, s, pending)
    if (r.changes.length) s = runTool(s, 'update_order', { changes: r.changes }).state
  }
  return s
}
const said = (lines: string[], start?: OrderState, pending?: Pending | null) => order(lines, start, pending ?? null).lines.map(describeLine)

describe('single utterances from the benchmark set', () => {
  const cases: [string, string[]][] = [
    ['Hi, can I get two Stackhouse Doubles, one with no pickles.', ['1 Stackhouse Double', '1 Stackhouse Double, no pickles']],
    ['Let me get a Spicy Cluckwich meal, large, with a Sweet Tea.', ['1 Spicy Cluckwich, as a large meal with Sweet Tea']],
    ['Can I get ten Cluck Bites with honey mustard and ranch.', ['1 10-piece Cluck Bites, honey mustard, ranch']],
    ['One medium chocolate Frostee and an Apple Turnover.', ['1 medium chocolate Frostee', '1 Apple Turnover']],
    ["I'll do the Smokestack BBQ with extra cheese and add bacon.", ['1 Smokestack BBQ, extra cheese, add bacon']],
    ['Two Stack Packs, one with the mini burger and one with Cluck Bites.', ['1 Stack Pack, mini burger', '1 Stack Pack, 4pc bites']],
    ['Can I get a Garden Stack, plain, and a small Fizzy Lemonade.', ['1 Garden Stack, plain', '1 small Fizzy Lemonade']],
    ['Give me a Stackhouse Triple meal with a large Stack Cola.', ['1 Stackhouse Triple, as a large meal with Stack Cola']],
    ['Twenty piece Cluck Bites with sweet chili sauce.', ['1 20-piece Cluck Bites, sweet chili']],
    ['A vanilla Frostee, small, and a strawberry Frostee, large.', ['1 small vanilla Frostee', '1 large strawberry Frostee']],
    ['Can I get a Cluckwich with no tomato and extra sauce.', ['1 Cluckwich, no tomato, extra sauce']],
    ['Three Stackhouse Singles, all with no pickles, and three waters.', ['3 Stackhouse Single, no pickles', '3 Bottled Water']],
    ['I want the Smokestack BBQ meal, medium, with a Fizzy Lemonade.', ['1 Smokestack BBQ, as a medium meal with Fizzy Lemonade']],
    ['Six piece Cluck Bites with barbecue sauce for my daughter.', ['1 6-piece Cluck Bites, bbq sauce (for my daughter)']],
    ['Two Spicy Cluckwiches and a large onion rings.', ['2 Spicy Cluckwich', '1 large Onion Rings']],
    ['One Stackhouse Double, extra pickles, extra onions, no sauce.', ['1 Stackhouse Double, extra pickles, extra onions, no sauce']],
    ['And a medium Sweet Tea, no ice, for my husband.', ['1 medium Sweet Tea, no ice (for my husband)']],
    ["That's it. Oh, and a Garden Stack meal with a Diet Stack Cola.", ['1 Garden Stack, as a medium meal with Diet Stack Cola']],
    ['Can I get a large chocolate Frostee and two Apple Turnovers.', ['1 large chocolate Frostee', '2 Apple Turnover']],
    ['A Stackhouse Single and a Stackhouse Double.', ['1 Stackhouse Single', '1 Stackhouse Double']],
  ]
  for (const [text, expected] of cases) {
    it(text, () => expect(said([text])).toEqual(expected))
  }

  it('parses a drink without a size, which the engine then asks about', () => {
    const r = parseUtterance('Large Stack Fries, no salt, and a Diet Stack Cola with light ice.', emptyOrder())
    expect(r.changes).toEqual([
      { action: 'add', item_id: 'stack_fries', size: 'large', quantity: 1, modifiers: ['no_salt'] },
      { action: 'add', item_id: 'diet_stack_cola', quantity: 1, modifiers: ['light_ice'] },
    ])
    const o = runTool(emptyOrder(), 'update_order', { changes: r.changes })
    expect(o.state.lines.map(describeLine)).toEqual(['1 large Stack Fries, no salt'])
    expect((o.result.results as { error?: string }[])[1].error).toBe('size_required')
  })
})

describe('corrections', () => {
  it('"two doubles… actually make one of those a single, with no pickles"', () => {
    expect(said(['Hi, can I get two Stackhouse Doubles.', 'Actually, make one of those a single, with no pickles.'])).toEqual([
      '1 Stackhouse Double', '1 Stackhouse Single, no pickles',
    ])
  })
  it('"make that a Stackhouse Single instead, no onions"', () => {
    expect(said(['A Stackhouse Double please.', 'Actually, make that a Stackhouse Single instead, no onions.'])).toEqual(['1 Stackhouse Single, no onions'])
  })
  it('"scratch the onion rings, just a small fries"', () => {
    expect(said(['A large onion rings and a Cluckwich.', 'No wait, scratch the onion rings, just a small fries.'])).toEqual(['1 Cluckwich', '1 small Stack Fries'])
  })
  it('"make the lemonade a large and add an Apple Turnover"', () => {
    expect(said(['A small Fizzy Lemonade.', 'Make the lemonade a large and add an Apple Turnover.'])).toEqual(['1 large Fizzy Lemonade', '1 Apple Turnover'])
  })
  it('"change the Double to a Triple, and hold the cheese"', () => {
    expect(said(['A Stackhouse Double.', 'Can I change the Double to a Triple, and hold the cheese.'])).toEqual(['1 Stackhouse Triple, no cheese'])
  })
  it('"no pickles on that" applies to the last burger', () => {
    expect(said(['A Stackhouse Double and a large Stack Cola.', 'Actually no pickles on the burger.'])).toEqual(['1 Stackhouse Double, no pickles', '1 large Stack Cola'])
  })
  it('"make it a meal"', () => {
    const s = order(['A Cluckwich.'])
    const r = parseUtterance('Make it a meal.', s)
    expect(r.changes).toEqual([{ action: 'change', line_id: 'L1', as_meal: true }])
  })
  it('"just one" reduces the last line', () => {
    expect(said(['Three Apple Turnovers.', 'Actually just one.'])).toEqual(['1 Apple Turnover'])
  })
})

describe('guardrail inputs', () => {
  it('reads "eighteen thousand waters" as 18000 so the engine can refuse it', () => {
    const r = parseUtterance('Can I get eighteen thousand waters?', emptyOrder())
    expect(r.changes).toEqual([{ action: 'add', item_id: 'bottled_water', quantity: 18000 }])
  })
  it('"just kidding, one water" adds one', () => {
    expect(said(['Ha, just kidding. Just one water please.'])).toEqual(['1 Bottled Water'])
  })
})

describe('answers to questions', () => {
  it('a bare size completes the item that needed one', () => {
    const pending: Pending = { kind: 'item', change: { action: 'add', item_id: 'stack_fries', quantity: 1 }, missing: 'size' }
    expect(said(['Large.'], emptyOrder(), pending)).toEqual(['1 large Stack Fries'])
  })
  it('"chocolate, small" completes a Frostee', () => {
    const pending: Pending = { kind: 'item', change: { action: 'add', item_id: 'frostee', quantity: 1 }, missing: 'flavor' }
    expect(said(['Chocolate, small.'], emptyOrder(), pending)).toEqual(['1 small chocolate Frostee'])
  })
  it('a drink answers "which drink with the meal?"', () => {
    const start = order(['A Cluckwich.'])
    const pending: Pending = { kind: 'item', change: { action: 'change', line_id: 'L1', as_meal: true }, missing: 'meal_drink' }
    expect(said(['A large Sweet Tea.'], start, pending)).toEqual(['1 Cluckwich, as a large meal with Sweet Tea'])
  })
  it('"sure, why not" accepts the offer', () => {
    const start = order(['A Stackhouse Double.'])
    const pending: Pending = { kind: 'offer', change: { action: 'add', item_id: 'apple_turnover', quantity: 1 } }
    expect(said(['Sure, why not.'], start, pending)).toEqual(['1 Stackhouse Double', '1 Apple Turnover'])
  })
  it('"no thanks" declines', () => {
    const pending: Pending = { kind: 'offer', change: { action: 'add', item_id: 'apple_turnover', quantity: 1 } }
    const r = parseUtterance('No thanks.', emptyOrder(), pending)
    expect(r.changes).toEqual([])
    expect(r.negative).toBe(true)
  })
})

describe('intents', () => {
  it('wants a human', () => expect(parseUtterance('Ugh, can I just talk to a real person?', emptyOrder()).wantsHuman).toBe(true))
  it('done', () => expect(parseUtterance("That's everything.", emptyOrder()).done).toBe(true))
  it('flags an order it could not match', () => expect(parseUtterance('Can I get a Big Mac?', emptyOrder()).unmatched).toBe(true))
})
