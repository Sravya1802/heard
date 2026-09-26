// Turns what the guest said (AssemblyAI's transcript) into order changes.
//
// Deliberately not an LLM. A drive-thru order is a small, closed language:
// menu items, quantities, sizes, options, meals and corrections. Parsing it
// deterministically means the same words always produce the same order, it is
// unit-tested, and order accuracy depends only on how well the words were heard.

import { MENU, MENU_BY_ID, type Modifier, type Size } from './menu'
import type { Line, OrderState } from './order-engine'

export interface Change {
  action: 'add' | 'change' | 'remove'
  line_id?: string
  item_id?: string
  quantity?: number
  size?: string
  modifiers?: string[]
  remove_modifiers?: string[]
  for_whom?: string
  as_meal?: boolean
  meal_drink_id?: string
  meal_size?: string
}

/** A question the agent is waiting on, so a bare "large" or "sure" can be understood. */
export type Pending =
  | { kind: 'item'; change: Change; missing: 'size' | 'flavor' | 'kids_main' | 'meal_drink' }
  | { kind: 'offer'; change: Change }

export interface ParseResult {
  changes: Change[]
  affirmative?: boolean
  negative?: boolean
  /** "That's it", "that's all". */
  done?: boolean
  wantsHuman?: boolean
  /** Sounded like an order, but nothing matched the menu. */
  unmatched?: boolean
}

// ------------------------------------------------------------- tokens ---

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/(\d),(\d{3})/g, '$1$2')
    .replace(/[’']/g, '')
    .replace(/-/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' , ')
    .split(/\s+/)
    .filter(Boolean)
}

const SMALL: Record<string, number> = {
  zero: 0, a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  couple: 2,
  // Spanish
  un: 1, uno: 1, una: 1, unos: 1, unas: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
}
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50,
}
const ARTICLES = new Set(['a', 'an', 'couple', 'un', 'una', 'unos', 'unas'])

/** Read a number phrase starting at i: "2", "eighteen thousand", "twenty two". */
function numberAt(t: string[], i: number): { value: number; len: number } | null {
  if (/^\d+$/.test(t[i] ?? '')) {
    return t[i + 1] === 'thousand' || t[i + 1] === 'mil' ? { value: Number(t[i]) * 1000, len: 2 } : { value: Number(t[i]), len: 1 }
  }
  let total = 0, current = 0, len = 0
  while (i + len < t.length) {
    const w = t[i + len]
    if (ARTICLES.has(w) && len > 0) break
    if (SMALL[w] != null) current += SMALL[w]
    else if (TENS[w] != null) current += TENS[w]
    else if ((w === 'hundred' || w === 'cien' || w === 'cientos') && len) current *= 100
    else if ((w === 'thousand' || w === 'mil') && len) { total += current * 1000; current = 0 }
    else if (w === 'y' && len && TENS[t[i + len - 1]] != null) { /* "veinte y dos" */ }
    else break
    len++
    if (ARTICLES.has(w)) break
  }
  return len ? { value: total + current, len } : null
}

/** The number phrase that ends exactly at index j, if any. */
function numberEndingAt(t: string[], j: number): { value: number; from: number } | null {
  for (let from = Math.max(0, j - 3); from <= j; from++) {
    const n = numberAt(t, from)
    if (n && from + n.len - 1 === j) return { value: n.value, from }
  }
  return null
}

// ------------------------------------------------------------ lexicon ---

interface Phrase { words: string[]; itemId: string }

const EXTRA_ALIASES: Record<string, string[]> = {
  stackhouse_single: ['stack house single', 'single stackhouse', 'single'],
  stackhouse_double: ['stack house double', 'double stackhouse', 'double'],
  stackhouse_triple: ['stack house triple', 'triple'],
  smokestack: ['smokestack bbq', 'smoke stack bbq', 'smokestack barbecue', 'smoke stack barbecue'],
  cluckwich: ['cluck wich', 'cluckwitch', 'clockwich', 'cluck witch'],
  spicy_cluckwich: ['spicy cluck wich', 'spicy cluckwitch', 'spicy clockwich', 'spicy cluck witch'],
  cluck_bites: ['cluck bite', 'clock bites', 'cluckbites'],
  stack_fries: ['fry', 'stack fry'],
  frostee: ['frosties', 'frosteee'],
  stack_pack: ['stackpack'],
  diet_stack_cola: ['diet stack coke', 'refresco de dieta', 'coca de dieta', 'coca light', 'soda de dieta'],
}

/** How Spanish-speaking guests name the same menu items (brand names usually stay in English). */
const SPANISH_ALIASES: Record<string, string[]> = {
  stackhouse_single: ['stackhouse sencilla', 'stack house sencilla', 'hamburguesa sencilla', 'sencilla', 'hamburguesa normal'],
  stackhouse_double: ['stackhouse doble', 'stack house doble', 'hamburguesa doble', 'doble', 'double stackhouse'],
  stackhouse_triple: ['stackhouse triple', 'hamburguesa triple', 'triple stackhouse'],
  cluckwich: ['sandwich de pollo', 'torta de pollo'],
  spicy_cluckwich: ['cluckwich picante', 'sandwich de pollo picante', 'cluckwiches picantes'],
  cluck_bites: ['nuggets de pollo', 'nuggets', 'pedacitos de pollo'],
  stack_fries: ['papas fritas', 'papas', 'papitas'],
  onion_rings: ['aros de cebolla', 'aritos de cebolla'],
  stack_cola: ['refresco', 'refrescos', 'coca', 'coca cola'],
  fizzy_lemonade: ['limonada', 'limonadas'],
  sweet_tea: ['te dulce', 'te helado', 'te'],
  bottled_water: ['agua', 'aguas', 'botella de agua', 'botellas de agua'],
  frostee: ['malteada', 'malteadas', 'batido', 'licuado'],
  apple_turnover: ['pay de manzana', 'empanada de manzana', 'pastel de manzana'],
  stack_pack: ['cajita', 'menu infantil', 'cajita feliz'],
}

const PHRASES: Phrase[] = (() => {
  const out: Phrase[] = []
  const seen = new Set<string>()
  const add = (text: string, itemId: string) => {
    const w = tokenize(text)
    const last = w[w.length - 1]
    const forms = new Set([last, last + 's', last + 'es', last.endsWith('y') ? last.slice(0, -1) + 'ies' : last])
    for (const f of forms) {
      const words = [...w.slice(0, -1), f]
      const key = words.join(' ')
      if (!seen.has(key)) { seen.add(key); out.push({ words, itemId }) }
    }
  }
  for (const m of MENU) {
    add(m.name, m.id)
    for (const a of m.aliases ?? []) add(a, m.id)
    for (const a of EXTRA_ALIASES[m.id] ?? []) add(a, m.id)
    for (const a of SPANISH_ALIASES[m.id] ?? []) add(a, m.id)
  }
  // Longest first: "spicy cluckwich" beats "cluckwich", "diet stack cola" beats "stack cola".
  return out.sort((a, b) => b.words.length - a.words.length)
})()

function phraseAt(t: string[], i: number): Phrase | null {
  for (const p of PHRASES) if (p.words.every((w, k) => t[i + k] === w)) return p
  return null
}

const SIZE_WORDS: Record<string, Size> = {
  small: 'small', medium: 'medium', regular: 'medium', large: 'large', big: 'large',
  chico: 'small', chica: 'small', chicas: 'small', chicos: 'small', pequeno: 'small', pequena: 'small',
  mediano: 'medium', mediana: 'medium', medianas: 'medium', medianos: 'medium',
  grande: 'large', grandes: 'large',
}
const FLAVORS = new Set(['chocolate', 'vanilla', 'strawberry'])
const FLAVOR_WORDS: Record<string, Modifier> = { chocolate: 'chocolate', vanilla: 'vanilla', strawberry: 'strawberry', vainilla: 'vanilla', fresa: 'strawberry' }
const TOPPINGS: Record<string, string> = {
  pickle: 'pickles', pickles: 'pickles', onion: 'onions', onions: 'onions', cheese: 'cheese', lettuce: 'lettuce',
  tomato: 'tomato', tomatoes: 'tomato', sauce: 'sauce', salt: 'salt', ice: 'ice',
  pepinillo: 'pickles', pepinillos: 'pickles', cebolla: 'onions', cebollas: 'onions', queso: 'cheese', lechuga: 'lettuce',
  tomate: 'tomato', tomates: 'tomato', salsa: 'sauce', sal: 'salt', hielo: 'ice',
}
const SAUCES: [string[], Modifier][] = [
  [['honey', 'mustard'], 'honey_mustard'], [['sweet', 'chili'], 'sweet_chili'], [['sweet', 'chilli'], 'sweet_chili'],
  [['bbq'], 'bbq_sauce'], [['barbecue'], 'bbq_sauce'], [['ranch'], 'ranch'],
  [['mostaza', 'con', 'miel'], 'honey_mustard'], [['mostaza', 'miel'], 'honey_mustard'], [['barbacoa'], 'bbq_sauce'], [['chile', 'dulce'], 'sweet_chili'],
]
const YES = new Set(['yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'absolutely', 'definitely', 'correct', 'perfect', 'sounds', 'si', 'claro', 'dale', 'orale', 'correcto', 'exacto', 'perfecto'])
const NO = new Set(['no', 'nope', 'nah'])

/** An option (modifier) starting at i. */
function modifierAt(t: string[], i: number): { mod: Modifier; len: number } | null {
  const w = t[i], n = t[i + 1]
  // Spanish: "sin pepinillos", "extra queso" / "queso extra", "poco hielo", "con tocino"
  if (w === 'sin' && n) {
    const skip = ['el', 'la', 'los', 'las'].includes(n) ? 1 : 0
    if (t[i + 1 + skip] === 'nada') return { mod: 'plain', len: 2 + skip }
    const top = TOPPINGS[t[i + 1 + skip]]
    if (top) return { mod: `no_${top}` as Modifier, len: 2 + skip }
  }
  if ((w === 'extra' || w === 'doble' || w === 'mas') && n && TOPPINGS[n] && TOPPINGS[n] !== 'ice') return { mod: `extra_${TOPPINGS[n]}` as Modifier, len: 2 }
  if (TOPPINGS[w] && TOPPINGS[w] !== 'ice' && n === 'extra' && !['no', 'without', 'sin'].includes(t[i - 1] ?? '')) return { mod: `extra_${TOPPINGS[w]}` as Modifier, len: 2 }
  if (w === 'poco' && n === 'hielo') return { mod: 'light_ice', len: 2 }
  if (w === 'tocino' || (w === 'con' && n === 'tocino')) return { mod: 'add_bacon', len: w === 'con' ? 2 : 1 }
  if (FLAVOR_WORDS[w] && w !== 'chocolate' && !FLAVORS.has(w)) return { mod: FLAVOR_WORDS[w], len: 1 }
  if ((w === 'no' || w === 'without' || w === 'hold') && n) {
    const skip = w === 'hold' && n === 'the' ? 1 : 0
    const top = TOPPINGS[t[i + 1 + skip]]
    if (top) return { mod: `no_${top}` as Modifier, len: 2 + skip }
  }
  if (w === 'extra' && n && TOPPINGS[n] && TOPPINGS[n] !== 'ice') return { mod: `extra_${TOPPINGS[n]}` as Modifier, len: 2 }
  if ((w === 'light' || w === 'easy' || w === 'less') && n === 'ice') return { mod: 'light_ice', len: 2 }
  if (w === 'plain') return { mod: 'plain', len: 1 }
  if (w === 'add' && n === 'bacon') return { mod: 'add_bacon', len: 2 }
  if (w === 'bacon') return { mod: 'add_bacon', len: 1 }
  if (w === 'mini' && (n === 'burger' || n === 'burgers')) return { mod: 'mini_burger', len: 2 }
  if (w === '__kidsbites') return { mod: 'bites_4pc', len: 1 }
  for (const [words, mod] of SAUCES) {
    if (words.every((x, k) => t[i + k] === x)) return { mod, len: words.length + (t[i + words.length] === 'sauce' ? 1 : 0) }
  }
  if (FLAVORS.has(w)) return { mod: w as Modifier, len: 1 }
  return null
}

// ------------------------------------------------------------ parsing ---

interface Group { qty: number; modifiers: Modifier[] }

interface Mention {
  start: number
  end: number
  itemId: string
  qty?: number
  size?: Size
  modifiers: Modifier[]
  groups: Group[]
  forWhom?: string
  meal?: boolean
  mealDrinkId?: string
  mealSize?: 'medium' | 'large'
}

const isSandwich = (id: string) => ['burger', 'chicken'].includes(MENU_BY_ID[id].category) && id !== 'cluck_bites'
const isMealDrink = (id: string) => MENU_BY_ID[id].category === 'drink' && id !== 'bottled_water'

function findMentions(t: string[]): { mentions: Mention[]; used: Set<number> } {
  const mentions: Mention[] = []
  const used = new Set<number>()
  for (let i = 0; i < t.length; i++) {
    // "doble queso" / "double cheese" is extra cheese, not a Stackhouse Double.
    if (['doble', 'double', 'extra'].includes(t[i]) && TOPPINGS[t[i + 1]]) { i++; continue }
    const p = phraseAt(t, i)
    if (!p) continue
    const m: Mention = { start: i, end: i + p.words.length, itemId: p.itemId, modifiers: [], groups: [] }
    // Look back for quantity, size, flavor and "N piece".
    for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
      if (used.has(j) || t[j] === ',') break
      const w = t[j]
      if (SIZE_WORDS[w] && !m.size) { m.size = SIZE_WORDS[w]; used.add(j); continue }
      if (FLAVOR_WORDS[w]) { m.modifiers.push(FLAVOR_WORDS[w]); used.add(j); continue }
      if ((w === 'piece' || w === 'pc' || w === 'pieces') && j > 0) {
        const n = numberEndingAt(t, j - 1)
        if (n) { m.size = `${n.value}pc` as Size; for (let k = n.from; k <= j; k++) used.add(k); j = n.from; continue }
      }
      if (['spicy', 'the', 'of', 'those', 'these', 'more', 'another', 'order', 'orders', 'your',
        'el', 'la', 'los', 'las', 'de', 'mi', 'otra', 'otro', 'otras', 'otros', 'mas', 'hamburguesa', 'hamburguesas', 'orden', 'ordenes'].includes(w)) continue
      const n = numberEndingAt(t, j)
      if (n && m.qty == null) { m.qty = n.value; for (let k = n.from; k <= j; k++) used.add(k); j = n.from; continue }
      break
    }
    // "ten Cluck Bites" means the 10-piece.
    if (m.itemId === 'cluck_bites' && !m.size && m.qty != null && [6, 10, 20].includes(m.qty)) { m.size = `${m.qty}pc` as Size; m.qty = 1 }
    for (let k = m.start; k < m.end; k++) used.add(k)
    mentions.push(m)
    i = m.end - 1
  }
  return { mentions, used }
}

/** Options, size, meal, split groups and "for my daughter" that follow each item. */
function attachTrailing(t: string[], mentions: Mention[], used: Set<number>) {
  for (let n = 0; n < mentions.length; n++) {
    const m = mentions[n]
    const stop = n + 1 < mentions.length ? mentions[n + 1].start : t.length
    let group: Group | null = null
    for (let i = m.end; i < stop; i++) {
      if (used.has(i)) continue
      const w = t[i]
      // "two Doubles, one with no pickles": split one off with its own options.
      if (['one', '1', 'una', 'uno'].includes(w) && (m.qty ?? 1) >= 2 && ['with', 'no', 'without', 'extra', 'plain', 'hold', 'of', 'sin', 'con', 'de'].includes(t[i + 1] ?? '')) {
        group = { qty: 1, modifiers: [] }
        m.groups.push(group)
        continue
      }
      const mod = modifierAt(t, i)
      if (mod) { (group ? group.modifiers : m.modifiers).push(mod.mod); i += mod.len - 1; continue }
      if (SIZE_WORDS[w] && !m.size) { m.size = SIZE_WORDS[w]; continue }
      if (w === 'meal' || w === 'meals' || w === 'combo') { m.meal = true; continue }
      if ((w === 'for' && ['my', 'her', 'him', 'the', 'me'].includes(t[i + 1] ?? '')) || (w === 'para' && ['mi', 'el', 'la', 'ella', 'el', 'mis'].includes(t[i + 1] ?? ''))) {
        m.forWhom = ['my', 'the', 'mi', 'mis', 'el', 'la'].includes(t[i + 1]) && t[i + 2] && t[i + 2] !== ',' ? `${t[i + 1]} ${t[i + 2]}` : t[i + 1]
        i += m.forWhom.split(' ').length
      }
    }
  }
}

/** "... meal ... with a Sweet Tea": that drink is the meal's drink, not a separate item. */
function foldMealDrinks(t: string[], mentions: Mention[]) {
  for (let n = 0; n + 1 < mentions.length; n++) {
    const m = mentions[n], next = mentions[n + 1]
    if (m.meal && isMealDrink(next.itemId) && t.slice(m.end, next.start).some((w) => ['with', 'and', 'con', 'y'].includes(w))) {
      m.mealDrinkId = next.itemId
      if (next.size === 'medium' || next.size === 'large') m.mealSize = next.size
      mentions.splice(n + 1, 1)
    }
  }
  for (const m of mentions) {
    if (!isSandwich(m.itemId) || !m.size) continue
    // Sandwiches have no size: "a large Spicy Cluckwich meal" is a large meal.
    if (m.meal && !m.mealSize) m.mealSize = m.size === 'large' ? 'large' : 'medium'
    m.size = undefined
  }
}

function toAdd(m: Mention): Change[] {
  const base: Change = { action: 'add', item_id: m.itemId }
  if (m.size) base.size = m.size
  if (m.forWhom) base.for_whom = m.forWhom
  if (m.meal) { base.as_meal = true; if (m.mealDrinkId) base.meal_drink_id = m.mealDrinkId; if (m.mealSize) base.meal_size = m.mealSize }
  const total = m.qty ?? 1
  const split = m.groups.reduce((s, g) => s + g.qty, 0)
  const out: Change[] = []
  if (total - split > 0) out.push({ ...base, quantity: total - split, ...(m.modifiers.length ? { modifiers: [...m.modifiers] } : {}) })
  for (const g of m.groups) {
    const mods = [...m.modifiers, ...g.modifiers]
    out.push({ ...base, quantity: g.qty, ...(mods.length ? { modifiers: mods } : {}) })
  }
  return out
}

const clean = (t: string[]) => ` ${t.filter((w) => w !== ',').join(' ')} `

/**
 * Parse one guest utterance against the current order.
 * `pending` is the question the agent last asked, if any.
 */
export function parseUtterance(text: string, order: OrderState, pending: Pending | null = null): ParseResult {
  let t = tokenize(text)
  const result: ParseResult = { changes: [] }
  if (!t.length) return result

  // In a kids-meal context, "with Cluck Bites" is the Stack Pack's main, not an extra order.
  if (t.includes('pack') || t.includes('packs') || t.includes('stackpack') || (pending?.kind === 'item' && pending.missing === 'kids_main')) {
    const s = t.join(' ').replace(/\b(with|one with|the)( the)?( 4| four)?( piece)? (cluck bites|cluck bite|nuggets|chicken nuggets|bites|chicken bites)\b/g, (_m, w) => `${w} __kidsbites`)
    t = s.split(' ')
  }

  const said = clean(t)
  if (/ (talk|speak) (to|with) (a |an |the )?(real |actual )?(person|human|manager|someone|employee)| (real|actual) (person|human) | manager | hablar con (una |un |el |la |alguien)?(persona|humano|gerente|empleado|alguien)| persona real /.test(said)) result.wantsHuman = true
  if (/ (thats|that is|that will be|thatll be) (it|all|everything)| nothing else | im good | im done | all set | (eso )?(es|seria|sera) todo| nada mas | ya es todo /.test(said)) result.done = true

  const { mentions, used } = findMentions(t)
  attachTrailing(t, mentions, used)
  foldMealDrinks(t, mentions)

  const lines = order.lines
  const lastLine = (pred: (l: Line) => boolean = () => true) => [...lines].reverse().find(pred)
  const lineFor = (itemId: string) => lastLine((l) => l.itemId === itemId)
  const handled = new Set<Mention>()
  const before = (m: Mention, n = 8) => clean(t.slice(Math.max(0, m.start - n), m.start))

  // ---- removals: "scratch the onion rings", "remove one of the fries", "forget that" ----
  const removeRe = / (scratch|remove|cancel|forget|drop|delete|take off|lose|nix|no more|get rid of|quita|quitale|quitame|quite|cancela|cancelale|borra|elimina|olvida|saca|sin (el|la|los|las)) /
  for (const m of mentions) {
    const b = before(m, 6)
    if (!removeRe.test(b)) continue
    const line = lineFor(m.itemId)
    if (!line) continue
    const fewer = m.qty != null && / (one|1|una|uno) (of|de) /.test(b) ? 1 : m.qty != null && m.qty < line.qty && !/ (las|los|el|la|the) $/.test(b) ? m.qty : null
    result.changes.push(fewer ? { action: 'change', line_id: line.id, quantity: line.qty - fewer } : { action: 'remove', line_id: line.id })
    handled.add(m)
  }
  if (!mentions.length && removeRe.test(said) && / (that|those|it|them|last) /.test(said)) {
    const line = lastLine()
    if (line) result.changes.push({ action: 'remove', line_id: line.id })
  }

  for (let n = 0; n < mentions.length; n++) {
    const m = mentions[n]
    if (handled.has(m)) continue
    const b = before(m)

    // "make one of those a single, no pickles": split one off an existing line into a new item.
    const oneOf = /(make|change|switch|swap|turn) (one|1)( of (those|them|these|em|the \w+( \w+)?))? (to |into |as )?(a |an )?$/.exec(b.trimEnd() + ' ')
      ?? /(haz|has|cambia|cambiame|cambie) (una|uno)( de (esas|esos|ellas|ellos|las \w+|los \w+))? (a |por |en )?(una |un )?(que sea )?$/.exec(b.trimEnd() + ' ')
    if (oneOf && lines.length) {
      const namedWord = /^(the|las|los) /.test(oneOf[4] ?? '') ? oneOf[4].split(' ')[1] : null
      const namedIdx = namedWord ? t.lastIndexOf(namedWord, m.start) : -1
      const namedPhrase = namedIdx >= 0 ? phraseAt(t, namedIdx) : null
      const from = (namedPhrase ? lineFor(namedPhrase.itemId) : undefined) ?? lastLine((l) => l.qty > 1) ?? lastLine()
      if (from) {
        result.changes.push(from.qty > 1 ? { action: 'change', line_id: from.id, quantity: from.qty - 1 } : { action: 'remove', line_id: from.id })
        result.changes.push(...toAdd({ ...m, qty: 1, groups: [] }))
        if (namedPhrase) for (const other of mentions) if (other.start === namedIdx) handled.add(other)
        handled.add(m)
        continue
      }
    }

    // "make the lemonade a large", "make the Double a meal": the item names the line; what follows changes it.
    if (/ (make|change|switch|turn|swap|put|haz|has|hazme|cambia|cambiame|pon|ponme|dame) (the|my|that|la|el|las|los|mi|esa|ese) $/.test(b)) {
      const line = lineFor(m.itemId)
      const next = mentions[n + 1]
      const between = next ? t.slice(m.end, next.start).filter((w) => w !== ',') : []
      // "change the Double to/por a Triple", or Spanish "a una Triple" right before the new item.
      const toNew = next && (between.some((w) => ['to', 'into', 'por'].includes(w)) ||
        (between[0] === 'a' && between.length <= 2 && between.every((w) => ['a', 'una', 'un', 'an'].includes(w))))
      if (line && !toNew) {
        const c: Change = { action: 'change', line_id: line.id }
        if (m.size) c.size = m.size
        if (m.modifiers.length) c.modifiers = m.modifiers
        if (m.meal) { c.as_meal = true; if (m.mealDrinkId) c.meal_drink_id = m.mealDrinkId; if (m.mealSize) c.meal_size = m.mealSize }
        result.changes.push(c)
        handled.add(m)
        continue
      }
    }

    // "change the Double to a Triple, and hold the cheese"
    const next = mentions[n + 1]
    if (next && / (change|switch|swap|make|turn|cambia|cambiame|cambie) (the|my|that)? ?$/.test(b.replace(/ (the|my|that|la|el|las|los|mi) $/, ' ')) &&
        t.slice(m.end, next.start).some((w) => ['to', 'into', 'for', 'por'].includes(w))) {
      const from = lineFor(m.itemId)
      if (from) {
        const c: Change = { action: 'change', line_id: from.id, item_id: next.itemId }
        const mods = [...m.modifiers, ...next.modifiers]
        if (mods.length) c.modifiers = mods
        if (next.size) c.size = next.size
        result.changes.push(c)
        handled.add(m); handled.add(next)
        n++
        continue
      }
    }

    // "make that a single", "actually a triple instead": swap the most recent line of the same kind.
    const swap = /(make|change|switch|swap|turn) (that|it|this|those|them|mine) (to |into |as )?(a |an )?$/.test(b.trimEnd() + ' ')
      || /(cambiala|cambialo|cambialas|hazla|hazlo|mejor|mas bien)( a| por| en)? ?(una |un )?(que sea )?$/.test(b.trimEnd() + ' ')
      || t.slice(m.end, m.end + 3).includes('instead')
    if (swap && lines.length) {
      const cat = MENU_BY_ID[m.itemId].category
      const from = lastLine((l) => MENU_BY_ID[l.itemId].category === cat) ?? lastLine()!
      const c: Change = { action: 'change', line_id: from.id }
      if (from.itemId !== m.itemId) c.item_id = m.itemId
      if (m.size) c.size = m.size
      if (m.modifiers.length) c.modifiers = m.modifiers
      if (m.meal) { c.as_meal = true; if (m.mealDrinkId) c.meal_drink_id = m.mealDrinkId; if (m.mealSize) c.meal_size = m.mealSize }
      result.changes.push(c)
      handled.add(m)
      continue
    }
  }

  // ---- everything else named is a new item ----
  for (const m of mentions) if (!handled.has(m)) result.changes.push(...toAdd(m))

  // ---- answers to the agent's question ----
  if (pending?.kind === 'item') {
    if (!mentions.length) {
      const c: Change = { ...pending.change }
      let filled = false
      for (let i = 0; i < t.length; i++) {
        const mod = modifierAt(t, i)
        if (mod) { c.modifiers = [...(c.modifiers ?? []), mod.mod]; i += mod.len - 1; filled = true; continue }
        if (SIZE_WORDS[t[i]]) {
          if (pending.missing === 'meal_drink' || c.as_meal) c.meal_size = SIZE_WORDS[t[i]] === 'large' ? 'large' : 'medium'
          else c.size = SIZE_WORDS[t[i]]
          filled = true
        }
        const n = numberAt(t, i)
        if (pending.change.item_id === 'cluck_bites' && n && [6, 10, 20].includes(n.value)) { c.size = `${n.value}pc`; filled = true }
      }
      if (filled) result.changes.push(c)
    } else if (pending.missing === 'meal_drink') {
      const drink = result.changes.find((c) => c.action === 'add' && c.item_id && isMealDrink(c.item_id))
      if (drink) {
        result.changes = result.changes.filter((c) => c !== drink)
        result.changes.unshift({ ...pending.change, meal_drink_id: drink.item_id, ...(drink.size === 'large' ? { meal_size: 'large' } : {}) })
      }
    }
  } else if (pending?.kind === 'offer') {
    const yes = t.some((w) => YES.has(w)) || / why not | go ahead | lets do it | do it /.test(said)
    const no = t.some((w) => NO.has(w))
    const drink = result.changes.find((c) => c.action === 'add' && c.item_id && isMealDrink(c.item_id))
    if (pending.change.as_meal && drink && !no) {
      result.changes = result.changes.filter((c) => c !== drink)
      result.changes.unshift({ ...pending.change, meal_drink_id: drink.item_id, ...(drink.size === 'large' || drink.size === 'medium' ? { meal_size: drink.size } : {}) })
    } else if (yes && !no && !mentions.length) {
      const c: Change = { ...pending.change }
      for (let i = 0; i < t.length; i++) {
        const mod = modifierAt(t, i)
        if (mod) { c.modifiers = [...(c.modifiers ?? []), mod.mod]; i += mod.len - 1 }
        else if (SIZE_WORDS[t[i]]) { if (c.as_meal) c.meal_size = SIZE_WORDS[t[i]] === 'large' ? 'large' : 'medium'; else c.size = SIZE_WORDS[t[i]] }
      }
      result.changes.push(c)
    }
  }

  // ---- options, sizes, meals or quantities without an item: apply to an earlier line ----
  if (!mentions.length && !result.changes.length && !pending) {
    const mods: Modifier[] = []
    let size: Size | undefined, qty: number | undefined, meal = false
    for (let i = 0; i < t.length; i++) {
      const mod = modifierAt(t, i)
      if (mod) { mods.push(mod.mod); i += mod.len - 1; continue }
      if (SIZE_WORDS[t[i]]) size = SIZE_WORDS[t[i]]
      if (t[i] === 'meal' || t[i] === 'combo') meal = true
      if (['just', 'only'].includes(t[i])) { const n = numberAt(t, i + 1); if (n && n.value > 0) qty = n.value }
    }
    const target = meal ? lastLine((l) => isSandwich(l.itemId))
      : size ? lastLine((l) => Object.keys(MENU_BY_ID[l.itemId].price).length > 1)
      : mods.length ? lastLine((l) => mods.every((mod) => canTake(l, mod)))
      : qty != null ? lastLine() : undefined
    if (target) {
      const c: Change = { action: 'change', line_id: target.id }
      if (mods.length) c.modifiers = mods
      if (size) c.size = size
      if (qty != null) c.quantity = qty
      if (meal) c.as_meal = true
      result.changes.push(c)
    }
  }

  if (!result.changes.length) {
    if (t.some((w) => YES.has(w)) && !t.some((w) => NO.has(w))) result.affirmative = true
    if (t.some((w) => NO.has(w)) || / no thanks | no thank you | im good /.test(said)) result.negative = true
    if (!result.done && !result.wantsHuman && !result.affirmative && !result.negative &&
        / (get|want|have|like|order|give me|ill do|ill take|ill have|add|quiero|quisiera|dame|deme|me da|me das|me pones|me regala|agrega|agregame) /.test(said)) result.unmatched = true
  }
  return result
}

function canTake(l: Line, m: Modifier): boolean {
  const cat = MENU_BY_ID[l.itemId].category
  if (m.endsWith('_ice')) return cat === 'drink'
  if (m.endsWith('_salt')) return cat === 'side'
  if (FLAVORS.has(m)) return cat === 'dessert'
  if (['honey_mustard', 'bbq_sauce', 'ranch', 'sweet_chili'].includes(m)) return l.itemId === 'cluck_bites'
  return cat === 'burger' || cat === 'chicken'
}
