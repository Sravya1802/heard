// The order engine. The language model decides *what the guest meant*; this
// code decides *what goes on the ticket and what it costs*. Items, prices and
// totals never come from the model, so it cannot invent a menu item or a price.
//
// Every function is pure: (state, tool call) -> (new state, result for the model).
// Error messages are written to be read by the model, so they say exactly what
// to ask the guest next.

import {
  DRINK_IDS, MAX_ITEMS_PER_ORDER, MAX_QTY_PER_LINE, MEAL_CATEGORIES, MEAL_PRICE, MENU, MENU_BY_ID, MODIFIERS,
  TAX_RATE, formatPrice, resolveItemId, resolveModifier, sizesOf,
  type Modifier, type Size,
} from './menu'

export interface Meal { drinkId: string; size: 'medium' | 'large' }

export interface Line {
  id: string
  itemId: string
  qty: number
  size?: Size
  modifiers: Modifier[]
  forWhom?: string
  meal?: Meal
}

export interface OrderState {
  lines: Line[]
  nextLine: number
  /** Bumped on every change, so a read-back is only valid for the version it read. */
  version: number
  readBackVersion: number | null
  upsellOffered: boolean
  humanRequested: boolean
  submitted: null | { orderNumber: number; totalCents: number }
}

export interface EngineContext {
  /** Item ids the kitchen has marked unavailable ("the Frostee machine is down"). */
  unavailable?: ReadonlySet<string>
  nextOrderNumber?: () => number
}

export interface ToolOutcome {
  state: OrderState
  ok: boolean
  result: Record<string, unknown>
}

export function emptyOrder(): OrderState {
  return { lines: [], nextLine: 1, version: 0, readBackVersion: null, upsellOffered: false, humanRequested: false, submitted: null }
}

// ---------------------------------------------------------------- pricing ---

export function priceLine(line: Line): number {
  const item = MENU_BY_ID[line.itemId]
  const base = (line.size ? item.price[line.size] : item.price.base) ?? 0
  const extras = line.modifiers.reduce((sum, m) => sum + (MODIFIERS[m].price ?? 0), 0)
  const meal = line.meal ? MEAL_PRICE[line.meal.size] : 0
  return (base + extras + meal) * line.qty
}

export function totals(state: OrderState) {
  const subtotal = state.lines.reduce((sum, l) => sum + priceLine(l), 0)
  const tax = Math.round(subtotal * TAX_RATE)
  const itemCount = state.lines.reduce((sum, l) => sum + l.qty, 0)
  return { subtotal, tax, total: subtotal + tax, itemCount }
}

// ---------------------------------------------------------------- wording ---

const SIZE_WORDS: Record<Size, string> = { small: 'small', medium: 'medium', large: 'large', '6pc': '6-piece', '10pc': '10-piece', '20pc': '20-piece' }

/** How the agent should say a line out loud. */
export function describeLine(line: Line): string {
  const item = MENU_BY_ID[line.itemId]
  const flavor = line.modifiers.filter((m) => MODIFIERS[m].group === 'flavor').map((m) => m.replace('_', ' '))
  const rest = line.modifiers.filter((m) => MODIFIERS[m].group !== 'flavor').map((m) => MODIFIERS[m].label.toLowerCase())
  const parts = [String(line.qty)]
  if (line.size) parts.push(SIZE_WORDS[line.size])
  parts.push(...flavor, item.name)
  let text = parts.join(' ')
  if (rest.length) text += ', ' + rest.join(', ')
  if (line.meal) text += `, as a ${line.meal.size} meal with ${MENU_BY_ID[line.meal.drinkId].name}`
  if (line.forWhom) text += ` (for ${line.forWhom})`
  return text
}

function orderSummary(state: OrderState) {
  const t = totals(state)
  return {
    order: state.lines.map((l) => ({ line_id: l.id, text: describeLine(l) })),
    item_count: t.itemCount,
    subtotal: formatPrice(t.subtotal),
  }
}

// ---------------------------------------------------------- normalizing ---

function normalizeSize(input: unknown): Size | null {
  if (input == null || input === '') return null
  const s = String(input).toLowerCase().replace(/[^a-z0-9]/g, '')
  if (['small', 'sm', 's', 'kid', 'kids'].includes(s)) return 'small'
  if (['medium', 'med', 'm', 'regular', 'reg', 'normal'].includes(s)) return 'medium'
  if (['large', 'lg', 'l', 'big', 'xl'].includes(s)) return 'large'
  if (/^(6|six)(pc|piece|pieces)?$/.test(s)) return '6pc'
  if (/^(10|ten)(pc|piece|pieces)?$/.test(s)) return '10pc'
  if (/^(20|twenty)(pc|piece|pieces)?$/.test(s)) return '20pc'
  return null
}

function normalizeLineId(input: unknown): string {
  const s = String(input ?? '').trim().toUpperCase()
  return /^\d+$/.test(s) ? 'L' + s : s
}

function toList(input: unknown): string[] {
  if (input == null) return []
  if (Array.isArray(input)) return input.map(String)
  return String(input).split(',').map((s) => s.trim()).filter(Boolean)
}

function sameLine(a: Line, b: Omit<Line, 'id' | 'qty'>) {
  return a.itemId === b.itemId && a.size === b.size && (a.forWhom ?? '') === (b.forWhom ?? '') &&
    a.meal?.drinkId === b.meal?.drinkId && a.meal?.size === b.meal?.size &&
    [...a.modifiers].sort().join() === [...b.modifiers].sort().join()
}

const fail = (state: OrderState, error: string, message: string, extra: Record<string, unknown> = {}): ToolOutcome =>
  ({ state, ok: false, result: { ok: false, error, message, ...extra } })

const bump = (s: OrderState): OrderState => ({ ...s, version: s.version + 1 })

// ------------------------------------------------------------ validation ---

type Built = { ok: true; line: Omit<Line, 'id'> } | { ok: false; error: string; message: string }

/** Validate one line's item, size, modifiers and meal. Shared by add and modify. */
function buildLine(
  args: { itemId: string; qty: number; size: unknown; modifiers: string[]; forWhom?: string; asMeal?: boolean; mealDrink?: unknown; mealSize?: unknown },
  ctx: EngineContext,
): Built {
  const item = MENU_BY_ID[args.itemId]
  if (ctx.unavailable?.has(item.id)) {
    const alternatives = MENU.filter((m) => m.category === item.category && m.id !== item.id && !ctx.unavailable?.has(m.id)).map((m) => m.name)
    return { ok: false, error: 'unavailable', message: `${item.name} is unavailable right now. Apologize briefly and offer ${alternatives.length ? alternatives.join(' or ') : 'something else from the menu'}.` }
  }

  if (!Number.isInteger(args.qty) || args.qty < 1) {
    return { ok: false, error: 'invalid_quantity', message: 'Quantity must be a whole number of at least 1. Ask how many they want.' }
  }
  if (args.qty > MAX_QTY_PER_LINE) {
    return {
      ok: false, error: 'quantity_too_high',
      message: `The guest asked for ${args.qty} ${item.name}. The drive-thru limit is ${MAX_QTY_PER_LINE} of one item. Do not add it. Lightly confirm the number (they may have misspoken, or be joking); for large orders, suggest calling the store for catering.`,
    }
  }

  const sizes = sizesOf(item)
  let size: Size | undefined
  if (sizes.length) {
    const s = normalizeSize(args.size)
    if (!s) return { ok: false, error: 'size_required', message: `Ask what size ${item.name} they want: ${sizes.map((z) => SIZE_WORDS[z]).join(', ')}.` }
    if (!sizes.includes(s)) return { ok: false, error: 'size_unavailable', message: `${item.name} comes in ${sizes.map((z) => SIZE_WORDS[z]).join(' or ')}, not ${SIZE_WORDS[s]}. Ask which one.` }
    size = s
  }

  const modifiers: Modifier[] = []
  for (const raw of args.modifiers) {
    const m = resolveModifier(raw)
    if (!m) return { ok: false, error: 'unknown_modifier', message: `"${raw}" is not an option we can do. Tell the guest briefly and continue.` }
    if (!MODIFIERS[m].categories.includes(item.category)) {
      return { ok: false, error: 'modifier_not_allowed', message: `"${MODIFIERS[m].label.toLowerCase()}" does not apply to ${item.name}. Skip it or ask what they meant.` }
    }
    if (!modifiers.includes(m)) modifiers.push(m)
  }
  for (const group of ['flavor', 'kids_main']) {
    const inGroup = modifiers.filter((m) => MODIFIERS[m].group === group)
    if (inGroup.length > 1) return { ok: false, error: 'conflicting_options', message: `Pick only one of: ${inGroup.map((m) => MODIFIERS[m].label.toLowerCase()).join(', ')}. Ask the guest which.` }
  }
  if (item.id === 'frostee' && !modifiers.some((m) => MODIFIERS[m].group === 'flavor')) {
    return { ok: false, error: 'flavor_required', message: 'Ask which Frostee flavor: chocolate, vanilla or strawberry.' }
  }
  if (item.id === 'stack_pack' && !modifiers.some((m) => MODIFIERS[m].group === 'kids_main')) {
    return { ok: false, error: 'kids_main_required', message: 'Ask whether the Stack Pack comes with a mini burger or 4 Cluck Bites.' }
  }

  let meal: Meal | undefined
  if (args.asMeal) {
    if (!MEAL_CATEGORIES.includes(item.category)) {
      return { ok: false, error: 'meal_not_available', message: `${item.name} can't be made a meal. Only burgers and chicken sandwiches can.` }
    }
    const drinkId = args.mealDrink ? resolveItemId(String(args.mealDrink)) : null
    if (!drinkId || !DRINK_IDS.includes(drinkId) || drinkId === 'bottled_water') {
      return { ok: false, error: 'meal_drink_required', message: 'Ask which drink comes with the meal: Stack Cola, Diet Stack Cola, Fizzy Lemonade or Sweet Tea.' }
    }
    if (ctx.unavailable?.has(drinkId)) return { ok: false, error: 'unavailable', message: `${MENU_BY_ID[drinkId].name} is unavailable right now. Ask for another drink.` }
    const ms = normalizeSize(args.mealSize) ?? 'medium'
    if (ms !== 'medium' && ms !== 'large') return { ok: false, error: 'meal_size_invalid', message: 'Meals come medium or large. Ask which.' }
    meal = { drinkId, size: ms }
  }

  const forWhom = args.forWhom?.trim() ? args.forWhom.trim().slice(0, 40) : undefined
  return { ok: true, line: { itemId: item.id, qty: args.qty, size, modifiers, forWhom, meal } }
}

// ------------------------------------------------------------------ tools ---

type Args = Record<string, unknown>

function addItem(state: OrderState, a: Args, ctx: EngineContext): ToolOutcome {
  const itemId = resolveItemId(String(a.item_id ?? ''))
  if (!itemId) {
    return fail(state, 'not_on_menu', `"${a.item_id}" is not on the Stackhouse menu. Say we don't have it and suggest the closest item.`)
  }
  const built = buildLine({
    itemId, qty: a.quantity == null ? 1 : Number(a.quantity), size: a.size, modifiers: toList(a.modifiers),
    forWhom: a.for_whom ? String(a.for_whom) : undefined, asMeal: Boolean(a.as_meal), mealDrink: a.meal_drink_id, mealSize: a.meal_size,
  }, ctx)
  if (!built.ok) return fail(state, built.error, built.message)

  if (totals(state).itemCount + built.line.qty > MAX_ITEMS_PER_ORDER) {
    return fail(state, 'order_too_large', `That would make more than ${MAX_ITEMS_PER_ORDER} items in one car. Don't add it; suggest calling the store for a large order.`)
  }

  const existing = state.lines.find((l) => sameLine(l, built.line))
  if (existing && existing.qty + built.line.qty <= MAX_QTY_PER_LINE) {
    const lines = state.lines.map((l) => (l === existing ? { ...l, qty: l.qty + built.line.qty } : l))
    const next = bump({ ...state, lines })
    return { state: next, ok: true, result: { ok: true, line_id: existing.id, now: describeLine(lines.find((l) => l.id === existing.id)!), ...orderSummary(next) } }
  }

  const line: Line = { id: 'L' + state.nextLine, ...built.line }
  const next = bump({ ...state, lines: [...state.lines, line], nextLine: state.nextLine + 1 })
  return { state: next, ok: true, result: { ok: true, line_id: line.id, added: describeLine(line), ...orderSummary(next) } }
}

function modifyItem(state: OrderState, a: Args, ctx: EngineContext): ToolOutcome {
  const id = normalizeLineId(a.line_id)
  const line = state.lines.find((l) => l.id === id)
  if (!line) return fail(state, 'unknown_line', `There is no line ${id}. Current lines: ${state.lines.map((l) => `${l.id} = ${describeLine(l)}`).join('; ') || 'none'}.`)

  if (a.quantity != null && Number(a.quantity) === 0) return removeItem(state, { line_id: id })

  const itemId = a.item_id ? resolveItemId(String(a.item_id)) : line.itemId
  if (!itemId) return fail(state, 'not_on_menu', `"${a.item_id}" is not on the menu. Say we don't have it.`)

  const remove = new Set(toList(a.remove_modifiers).map((m) => resolveModifier(m)).filter(Boolean) as Modifier[])
  // Swapping the item ("make that a single") keeps options that still apply, like "no pickles".
  const category = MENU_BY_ID[itemId].category
  const keptMods: string[] = line.modifiers.filter((m) => !remove.has(m) && MODIFIERS[m].categories.includes(category))
  const mods = [...keptMods, ...toList(a.add_modifiers)]

  const asMeal = a.as_meal == null ? Boolean(line.meal) : Boolean(a.as_meal)
  const built = buildLine({
    itemId,
    qty: a.quantity == null ? line.qty : Number(a.quantity),
    size: a.size ?? (itemId === line.itemId ? line.size : undefined),
    modifiers: mods,
    forWhom: a.for_whom != null ? String(a.for_whom) : line.forWhom,
    asMeal,
    mealDrink: a.meal_drink_id ?? line.meal?.drinkId,
    mealSize: a.meal_size ?? line.meal?.size,
  }, ctx)
  if (!built.ok) return fail(state, built.error, built.message)

  const updated: Line = { id: line.id, ...built.line }
  const others = totals({ ...state, lines: state.lines.filter((l) => l.id !== id) }).itemCount
  if (others + updated.qty > MAX_ITEMS_PER_ORDER) {
    return fail(state, 'order_too_large', `That would make more than ${MAX_ITEMS_PER_ORDER} items in one car. Suggest calling the store for a large order.`)
  }
  const next = bump({ ...state, lines: state.lines.map((l) => (l.id === id ? updated : l)) })
  return { state: next, ok: true, result: { ok: true, line_id: id, now: describeLine(updated), ...orderSummary(next) } }
}

function removeItem(state: OrderState, a: Args): ToolOutcome {
  const id = normalizeLineId(a.line_id)
  const line = state.lines.find((l) => l.id === id)
  if (!line) return fail(state, 'unknown_line', `There is no line ${id}. Current lines: ${state.lines.map((l) => `${l.id} = ${describeLine(l)}`).join('; ') || 'none'}.`)
  const next = bump({ ...state, lines: state.lines.filter((l) => l.id !== id) })
  return { state: next, ok: true, result: { ok: true, removed: describeLine(line), ...orderSummary(next) } }
}

/** One relevant offer per order, never more. */
function suggestUpsell(state: OrderState, ctx: EngineContext): ToolOutcome {
  if (state.upsellOffered) {
    return { state, ok: true, result: { ok: true, suggestion: null, note: 'An offer was already made for this order. Do not upsell again; move on to the read-back.' } }
  }
  const has = (pred: (l: Line) => boolean) => state.lines.some(pred)
  const cat = (l: Line) => MENU_BY_ID[l.itemId].category
  const available = (id: string) => !ctx.unavailable?.has(id)
  let suggestion: string | null = null
  let line_id: string | undefined

  const mealless = state.lines.find((l) => MEAL_CATEGORIES.includes(cat(l)) && !l.meal)
  const hasSide = has((l) => cat(l) === 'side')
  const hasDrink = has((l) => cat(l) === 'drink' || Boolean(l.meal))
  if (mealless && !hasSide && !hasDrink) {
    suggestion = `Offer to make the ${MENU_BY_ID[mealless.itemId].name} a meal with fries and a drink for ${formatPrice(MEAL_PRICE.medium)} more.`
    line_id = mealless.id
  } else if (!hasDrink && available('stack_cola')) {
    suggestion = 'Offer a drink: a Stack Cola, Fizzy Lemonade or Sweet Tea.'
  } else if (!has((l) => cat(l) === 'dessert') && available('frostee')) {
    suggestion = 'Offer a Frostee (chocolate, vanilla or strawberry) for dessert.'
  } else if (!has((l) => cat(l) === 'dessert') && available('apple_turnover')) {
    suggestion = 'Offer a warm Apple Turnover for dessert.'
  }
  const next = { ...state, upsellOffered: true }
  return { state: next, ok: true, result: { ok: true, suggestion, line_id, note: suggestion ? 'Make this offer once, in one short friendly sentence. Accept a no without pushing.' : 'Nothing worth offering. Move on to the read-back.' } }
}

function readBack(state: OrderState): ToolOutcome {
  if (!state.lines.length) return fail(state, 'empty_order', 'The order is empty. Ask what they would like.')
  const t = totals(state)
  const next = { ...state, readBackVersion: state.version }
  return {
    state: next, ok: true,
    result: {
      ok: true,
      say: `${state.lines.map(describeLine).join('; ')}. Your total is ${formatPrice(t.total)}.`,
      total: formatPrice(t.total),
      note: 'Read this back naturally (you may drop the leading "1"), then ask if everything is right.',
    },
  }
}

function submitOrder(state: OrderState, ctx: EngineContext): ToolOutcome {
  if (!state.lines.length) return fail(state, 'empty_order', 'Nothing to submit yet. Ask what they would like.')
  if (state.readBackVersion !== state.version) {
    return fail(state, 'read_back_required', 'The order changed since it was last read back. Call read_back and confirm with the guest before submitting.')
  }
  const t = totals(state)
  const orderNumber = ctx.nextOrderNumber?.() ?? 100 + Math.floor(Math.random() * 900)
  const next = { ...state, submitted: { orderNumber, totalCents: t.total } }
  return {
    state: next, ok: true,
    result: { ok: true, order_number: orderNumber, total: formatPrice(t.total), say: `Your total is ${formatPrice(t.total)}. Please pull forward to the first window.` },
  }
}

function requestHuman(state: OrderState, a: Args): ToolOutcome {
  const next = { ...state, humanRequested: true }
  return {
    state: next, ok: true,
    result: { ok: true, reason: a.reason ? String(a.reason) : undefined, say: 'No problem, a crew member is jumping on the speaker now. One moment.', note: 'Say this once, then stay quiet unless spoken to.' },
  }
}

const MUTATING = new Set(['add_item', 'modify_item', 'remove_item'])

export function runTool(state: OrderState, name: string, args: Args, ctx: EngineContext = {}): ToolOutcome {
  if (state.submitted && (MUTATING.has(name) || name === 'submit_order')) {
    return fail(state, 'already_submitted', `Order #${state.submitted.orderNumber} was already sent to the kitchen. Changes now need the window crew; tell the guest to mention it at the window.`)
  }
  switch (name) {
    case 'add_item': return addItem(state, args, ctx)
    case 'modify_item': return modifyItem(state, args, ctx)
    case 'remove_item': return removeItem(state, args)
    case 'suggest_upsell': return suggestUpsell(state, ctx)
    case 'read_back': return readBack(state)
    case 'submit_order': return submitOrder(state, ctx)
    case 'request_human': return requestHuman(state, args)
    default: return fail(state, 'unknown_tool', `No tool named ${name}.`)
  }
}

/** What the kitchen screen shows for one line. */
export function ticketLine(line: Line) {
  const item = MENU_BY_ID[line.itemId]
  return {
    id: line.id,
    qty: line.qty,
    name: item.name,
    size: line.size ? SIZE_WORDS[line.size] : undefined,
    modifiers: line.modifiers.map((m) => MODIFIERS[m].label),
    meal: line.meal ? `${line.meal.size.toUpperCase()} MEAL · ${MENU_BY_ID[line.meal.drinkId].name}` : undefined,
    forWhom: line.forWhom,
  }
}
