import { describe, expect, it } from 'vitest'
import { addGeneric, addHeard, orderMeaning, sameMeaning } from './compare'

describe('pairing turns', () => {
  it('pairs a generic final that arrives just after Heard', () => {
    let rows = addHeard([], 'Two Spicy Cluckwiches.', 1000)
    rows = addGeneric(rows, 'Two spicy clock witches.', 1800)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ heard: 'Two Spicy Cluckwiches.', generic: ['Two spicy clock witches.'] })
  })

  it('pairs when the generic side finishes first', () => {
    let rows = addGeneric([], 'Two spicy clock witches.', 1000)
    rows = addHeard(rows, 'Two Spicy Cluckwiches.', 2200)
    expect(rows).toHaveLength(1)
  })

  it('keeps a generic-only row when Heard heard nothing (filtered background speech)', () => {
    let rows = addHeard([], 'A Stackhouse Double.', 1000)
    rows = addGeneric(rows, 'A Stackhouse double.', 1500)
    rows = addGeneric(rows, 'I want nuggets!', 9000)
    expect(rows).toHaveLength(2)
    expect(rows[1].heard).toBeUndefined()
    expect(rows[1].generic).toEqual(['I want nuggets!'])
  })

  it('does not attach a late Heard turn to a stale generic-only row', () => {
    let rows = addGeneric([], 'Are we there yet?', 1000)
    rows = addHeard(rows, 'A large Frostee.', 20000)
    expect(rows).toHaveLength(2)
  })

  it('collects a generic side that split one sentence into two turns', () => {
    let rows = addHeard([], 'Let me get a Spicy Cluckwich meal, large, with a Sweet Tea.', 1000)
    rows = addGeneric(rows, 'Let me get a spicy clockwich meal.', 1200)
    rows = addGeneric(rows, 'Large with a sweet pea.', 2600)
    expect(rows).toHaveLength(1)
    expect(rows[0].generic).toHaveLength(2)
  })
})

describe('order meaning', () => {
  it('sees misheard brand names as a different order', () => {
    expect(sameMeaning('Two Spicy Cluckwiches and a large onion rings.', 'Two spicy clock witches and a large onion rings.')).toBe(false)
  })
  it('ignores punctuation and number words', () => {
    expect(sameMeaning('Can I get two Stackhouse Doubles?', 'can i get 2 stackhouse doubles')).toBe(true)
  })
  it('keeps items that still need a size', () => {
    expect(orderMeaning('And a Stack Cola.')).toEqual(['1 stack_cola'])
  })
})
