import { describe, expect, it } from 'vitest'
import { parseUtterance, type Pending } from './order-parser'
import { describeLine, emptyOrder, runTool, type OrderState } from './order-engine'

function order(lines: string[], pending: Pending | null = null): string[] {
  let s: OrderState = emptyOrder()
  for (const line of lines) {
    const r = parseUtterance(line, s, pending)
    if (r.changes.length) s = runTool(s, 'update_order', { changes: r.changes }).state
  }
  return s.lines.map(describeLine)
}

describe('Spanish and Spanglish orders', () => {
  const cases: [string, string[]][] = [
    ['Hola, quiero dos Stackhouse Doubles, una sin pepinillos.', ['1 Stackhouse Double', '1 Stackhouse Double, no pickles']],
    ['Y unas papas grandes.', ['1 large Stack Fries']],
    ['Una malteada de chocolate grande.', ['1 large chocolate Frostee']],
    ['Me da un Spicy Cluckwich en combo grande con té dulce.', ['1 Spicy Cluckwich, as a large meal with Sweet Tea']],
    ['Diez nuggets con mostaza con miel.', ['1 10-piece Cluck Bites, honey mustard']],
    ['Quiero una hamburguesa doble con doble queso y sin cebolla.', ['1 Stackhouse Double, extra cheese, no onions']],
    ['Tres aguas, por favor.', ['3 Bottled Water']],
    ['Una Frostee de vainilla chica y un pay de manzana.', ['1 small vanilla Frostee', '1 Apple Turnover']],
    ['Can I get dos Cluckwiches and unas papas medianas?', ['2 Cluckwich', '1 medium Stack Fries']],
    ['Una limonada grande con poco hielo para mi hija.', ['1 large Fizzy Lemonade, light ice (for mi hija)']],
    ['Hola, quiero 2 Stackhouse dobles, una sin pepinillos.', ['1 Stackhouse Double', '1 Stackhouse Double, no pickles']],
  ]
  for (const [text, expected] of cases) it(text, () => expect(order([text])).toEqual(expected))

  it('reads "dieciocho mil aguas" as 18000 so the guardrail can refuse it', () => {
    expect(parseUtterance('¿Me da dieciocho mil aguas?', emptyOrder()).changes).toEqual([{ action: 'add', item_id: 'bottled_water', quantity: 18000 }])
  })
})

describe('Spanish corrections', () => {
  it('"mejor una sencilla" swaps the burger', () => expect(order(['Una hamburguesa doble.', 'Mejor una sencilla.'])).toEqual(['1 Stackhouse Single']))
  it('"quita las papas" removes the fries', () => expect(order(['Unas papas grandes y un Cluckwich.', 'Quita las papas.'])).toEqual(['1 Cluckwich']))
  it('"haz la limonada grande" changes the size', () => expect(order(['Una limonada chica.', 'Haz la limonada grande.'])).toEqual(['1 large Fizzy Lemonade']))
  it('"cambia la doble por una triple sin queso"', () => expect(order(['Una doble.', 'Cambia la doble por una triple sin queso.'])).toEqual(['1 Stackhouse Triple, no cheese']))
  it('"cambia una de esas por una sencilla sin pepinillos"', () => {
    expect(order(['Dos dobles.', 'Cambia una de esas por una sencilla sin pepinillos.'])).toEqual(['1 Stackhouse Double', '1 Stackhouse Single, no pickles'])
  })
})

describe('Spanish intents and answers', () => {
  it('"eso es todo" is done', () => expect(parseUtterance('Eso es todo, gracias.', emptyOrder()).done).toBe(true))
  it('asks for a person', () => expect(parseUtterance('Quiero hablar con una persona.', emptyOrder()).wantsHuman).toBe(true))
  it('"sí, está bien" is a yes', () => expect(parseUtterance('Sí, está bien.', emptyOrder()).affirmative).toBe(true))
  it('"grande" answers a size question', () => {
    const pending: Pending = { kind: 'item', change: { action: 'add', item_id: 'stack_fries', quantity: 1 }, missing: 'size' }
    expect(order(['Grande.'], pending)).toEqual(['1 large Stack Fries'])
  })
  it('flags an order it could not match', () => expect(parseUtterance('Quiero unos tacos.', emptyOrder()).unmatched).toBe(true))
})
