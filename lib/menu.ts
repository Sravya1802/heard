// Stackhouse Burgers — a fictional chain. Every name here is invented so the
// demo never imitates a real brand, and so the speech-to-text has to work for
// it: made-up branded names are exactly what generic STT gets wrong.

export type Category = 'burger' | 'chicken' | 'side' | 'drink' | 'dessert' | 'kids'

export type Size = 'small' | 'medium' | 'large' | '6pc' | '10pc' | '20pc'

export interface MenuItem {
  id: string
  name: string
  category: Category
  /** Price in cents. Keyed by size for sized items, `base` otherwise. */
  price: Partial<Record<Size | 'base', number>>
  /** Other ways guests say it; used for fuzzy matching and STT key terms. */
  aliases?: string[]
  /** Short spoken description for the prompt. */
  blurb?: string
}

export const MENU: MenuItem[] = [
  { id: 'stackhouse_single', name: 'Stackhouse Single', category: 'burger', price: { base: 449 }, aliases: ['single', 'single burger', 'cheeseburger'], blurb: 'one beef patty, cheese, pickles, onions, Stack Sauce' },
  { id: 'stackhouse_double', name: 'Stackhouse Double', category: 'burger', price: { base: 629 }, aliases: ['double', 'double burger', 'double stack'], blurb: 'two patties, two cheese' },
  { id: 'stackhouse_triple', name: 'Stackhouse Triple', category: 'burger', price: { base: 799 }, aliases: ['triple', 'triple stack'], blurb: 'three patties, three cheese' },
  { id: 'smokestack', name: 'Smokestack BBQ', category: 'burger', price: { base: 699 }, aliases: ['smokestack', 'bbq burger', 'smoke stack'], blurb: 'bacon, onion rings, BBQ sauce' },
  { id: 'garden_stack', name: 'Garden Stack', category: 'burger', price: { base: 529 }, aliases: ['veggie burger', 'garden burger'], blurb: 'plant-based patty' },
  { id: 'cluckwich', name: 'Cluckwich', category: 'chicken', price: { base: 549 }, aliases: ['chicken sandwich', 'cluck sandwich', 'cluck-wich'], blurb: 'crispy chicken sandwich' },
  { id: 'spicy_cluckwich', name: 'Spicy Cluckwich', category: 'chicken', price: { base: 579 }, aliases: ['spicy chicken sandwich', 'spicy cluck'], blurb: 'spicy crispy chicken sandwich' },
  { id: 'cluck_bites', name: 'Cluck Bites', category: 'chicken', price: { '6pc': 349, '10pc': 549, '20pc': 999 }, aliases: ['nuggets', 'chicken nuggets', 'bites', 'chicken bites'], blurb: 'chicken nuggets in 6, 10 or 20 pieces' },
  { id: 'stack_fries', name: 'Stack Fries', category: 'side', price: { small: 219, medium: 279, large: 329 }, aliases: ['fries', 'french fries', 'chips'] },
  { id: 'onion_rings', name: 'Onion Rings', category: 'side', price: { small: 249, large: 349 }, aliases: ['rings'] },
  { id: 'stack_cola', name: 'Stack Cola', category: 'drink', price: { small: 179, medium: 219, large: 249 }, aliases: ['cola', 'coke', 'soda', 'pop'] },
  { id: 'diet_stack_cola', name: 'Diet Stack Cola', category: 'drink', price: { small: 179, medium: 219, large: 249 }, aliases: ['diet cola', 'diet coke', 'diet'] },
  { id: 'fizzy_lemonade', name: 'Fizzy Lemonade', category: 'drink', price: { small: 189, medium: 229, large: 259 }, aliases: ['lemonade', 'sprite'] },
  { id: 'sweet_tea', name: 'Sweet Tea', category: 'drink', price: { small: 159, medium: 189, large: 219 }, aliases: ['iced tea', 'tea'] },
  { id: 'bottled_water', name: 'Bottled Water', category: 'drink', price: { base: 149 }, aliases: ['water', 'waters'] },
  { id: 'frostee', name: 'Frostee', category: 'dessert', price: { small: 249, medium: 299, large: 349 }, aliases: ['frosty', 'shake', 'milkshake', 'frostie', 'frosted'], blurb: 'soft-serve shake: chocolate, vanilla or strawberry' },
  { id: 'apple_turnover', name: 'Apple Turnover', category: 'dessert', price: { base: 199 }, aliases: ['apple pie', 'turnover', 'pie'] },
  { id: 'stack_pack', name: 'Stack Pack', category: 'kids', price: { base: 499 }, aliases: ['kids meal', 'happy meal', 'kids pack'], blurb: 'kids meal: 4 Cluck Bites or a mini burger, small fries, small drink and a toy' },
]

export type Modifier =
  | 'no_pickles' | 'extra_pickles' | 'no_onions' | 'extra_onions'
  | 'no_cheese' | 'extra_cheese' | 'no_lettuce' | 'no_tomato'
  | 'no_sauce' | 'extra_sauce' | 'add_bacon' | 'plain'
  | 'no_ice' | 'light_ice' | 'no_salt' | 'extra_salt'
  | 'chocolate' | 'vanilla' | 'strawberry'
  | 'bbq_sauce' | 'honey_mustard' | 'ranch' | 'sweet_chili'
  | 'mini_burger' | 'bites_4pc'

export const MODIFIERS: Record<Modifier, { label: string; price?: number; categories: Category[]; group?: string }> = {
  no_pickles: { label: 'NO PICKLES', categories: ['burger', 'chicken'] },
  extra_pickles: { label: 'EXTRA PICKLES', categories: ['burger', 'chicken'] },
  no_onions: { label: 'NO ONIONS', categories: ['burger'] },
  extra_onions: { label: 'EXTRA ONIONS', categories: ['burger'] },
  no_cheese: { label: 'NO CHEESE', categories: ['burger'] },
  extra_cheese: { label: 'EXTRA CHEESE', price: 60, categories: ['burger', 'chicken'] },
  no_lettuce: { label: 'NO LETTUCE', categories: ['burger', 'chicken'] },
  no_tomato: { label: 'NO TOMATO', categories: ['burger', 'chicken'] },
  no_sauce: { label: 'NO SAUCE', categories: ['burger', 'chicken'] },
  extra_sauce: { label: 'EXTRA SAUCE', categories: ['burger', 'chicken'] },
  add_bacon: { label: 'ADD BACON', price: 100, categories: ['burger', 'chicken'] },
  plain: { label: 'PLAIN', categories: ['burger', 'chicken'] },
  no_ice: { label: 'NO ICE', categories: ['drink'] },
  light_ice: { label: 'LIGHT ICE', categories: ['drink'] },
  no_salt: { label: 'NO SALT', categories: ['side'] },
  extra_salt: { label: 'EXTRA SALT', categories: ['side'] },
  chocolate: { label: 'CHOCOLATE', categories: ['dessert'], group: 'flavor' },
  vanilla: { label: 'VANILLA', categories: ['dessert'], group: 'flavor' },
  strawberry: { label: 'STRAWBERRY', categories: ['dessert'], group: 'flavor' },
  bbq_sauce: { label: 'BBQ SAUCE', categories: ['chicken'] },
  honey_mustard: { label: 'HONEY MUSTARD', categories: ['chicken'] },
  ranch: { label: 'RANCH', categories: ['chicken'] },
  sweet_chili: { label: 'SWEET CHILI', categories: ['chicken'] },
  mini_burger: { label: 'MINI BURGER', categories: ['kids'], group: 'kids_main' },
  bites_4pc: { label: '4PC BITES', categories: ['kids'], group: 'kids_main' },
}

/** "Make it a meal": adds fries and a drink of the same size. Burgers and sandwiches only. */
export const MEAL_PRICE: Record<'medium' | 'large', number> = { medium: 319, large: 399 }
export const MEAL_CATEGORIES: Category[] = ['burger', 'chicken']
export const TAX_RATE = 0.08

/** Guardrails. One car rarely orders more than this; bigger orders go to catering. */
export const MAX_QTY_PER_LINE = 10
export const MAX_ITEMS_PER_ORDER = 25

export const MENU_BY_ID: Record<string, MenuItem> = Object.fromEntries(MENU.map((m) => [m.id, m]))
export const ITEM_IDS = MENU.map((m) => m.id)
export const MODIFIER_IDS = Object.keys(MODIFIERS) as Modifier[]
export const DRINK_IDS = MENU.filter((m) => m.category === 'drink').map((m) => m.id)

export function sizesOf(item: MenuItem): Size[] {
  return (Object.keys(item.price) as (Size | 'base')[]).filter((k): k is Size => k !== 'base')
}

export function formatPrice(cents: number): string {
  return '$' + (cents / 100).toFixed(2)
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Resolve an id, name or alias to a menu item id. Models sometimes pass names instead of ids. */
export function resolveItemId(input: string): string | null {
  if (!input) return null
  if (MENU_BY_ID[input]) return input
  const q = norm(input)
  const exact = MENU.find((m) => norm(m.id) === q || norm(m.name) === q || m.aliases?.some((a) => norm(a) === q))
  return exact?.id ?? null
}

export function resolveModifier(input: string): Modifier | null {
  if ((MODIFIERS as Record<string, unknown>)[input]) return input as Modifier
  const q = norm(input).replace(/ /g, '_')
  if ((MODIFIERS as Record<string, unknown>)[q]) return q as Modifier
  const byLabel = MODIFIER_IDS.find((id) => norm(MODIFIERS[id].label) === norm(input))
  return byLabel ?? null
}

/** Terms that generic speech-to-text is most likely to miss. Max 100 for the Voice Agent API. */
export function menuKeyterms(): string[] {
  const terms = new Set<string>()
  for (const m of MENU) {
    terms.add(m.name)
    for (const a of m.aliases ?? []) if (/[A-Z]|stack|cluck|frost/i.test(a)) terms.add(a)
  }
  for (const t of ['Stackhouse', 'Stack Sauce', 'Cluck Bites', 'Frostee', 'no pickles', 'extra pickles', 'honey mustard', 'sweet chili', 'make it a meal']) terms.add(t)
  return [...terms].slice(0, 100)
}
