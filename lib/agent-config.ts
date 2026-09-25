// Everything the Voice Agent API needs to know about Heard, sent inline in the
// first session.update. Tools are client-side: the browser runs them through
// the deterministic order engine and answers with tool.result.
//
// Docs: https://www.assemblyai.com/docs/voice-agents/voice-agent-api/session-configuration

import { DRINK_IDS, ITEM_IDS, MENU, MODIFIER_IDS, formatPrice, menuKeyterms, sizesOf } from './menu'

export type VoiceFocus = 'near-field' | 'far-field' | 'off'

export interface HearingOptions {
  /** `voice_focus` isolates the speaker nearest the mic; "off" is the baseline for comparisons. */
  voiceFocus: VoiceFocus
  voiceFocusThreshold?: number
  /** Menu names as key terms, plus a transcription prompt describing a drive-thru order. */
  keyterms: boolean
}

export const DEFAULT_HEARING: HearingOptions = { voiceFocus: 'far-field', keyterms: true }

const GREETING = 'Welcome to Stackhouse! What can I get started for you?'

function menuText(): string {
  return MENU.map((m) => {
    const sizes = sizesOf(m)
    const price = sizes.length ? sizes.map((s) => `${s} ${formatPrice(m.price[s]!)}`).join(', ') : formatPrice(m.price.base!)
    return `- ${m.id}: ${m.name} (${price})${m.blurb ? ' — ' + m.blurb : ''}`
  }).join('\n')
}

const SYSTEM_PROMPT = `You are Heard, the voice at the Stackhouse Burgers drive-thru speaker. You take orders from the driver of the car in the lane.

# How you talk
- Warm, quick and efficient. One or two short spoken sentences per turn. No lists, no markdown, no emojis.
- Never read line ids, item ids or prices unless reading back the order or asked.
- Sound like a great drive-thru crew member: "Got it", "Sure thing", "Anything else?"

# Hearing rules (this matters most)
- Take the order from the driver speaking into the speaker.
- If something sounds like it came from someone else in the car (a kid, a passenger, a radio), do not add it on your own. Ask the driver, for example "Should I add the nuggets too?"
- When the guest corrects themselves ("actually", "no wait", "make that", "scratch that"), fix the existing line with modify_item or remove_item. Never add a duplicate.
- If you did not catch something, ask for just that part again. After two failed tries on the same thing, call request_human.

# The order is only what the tools say
- Every change goes through a tool: add_item, modify_item, remove_item. Never say an item is added unless the tool returned ok.
- Never state a price or total yourself; only repeat what read_back or submit_order returned.
- If a tool returns ok false, follow its message. It tells you exactly what to ask or say.
- Only sell what is on the menu below. If they ask for something else, say you don't have it and suggest the closest item.
- Sized items (fries, onion rings, drinks, Frostee, Cluck Bites) need a size. A Frostee needs a flavor. A Stack Pack needs a mini burger or 4 Cluck Bites. If it's missing, ask for it in the same breath as "anything else?".
- "Make it a meal" adds fries and a drink: use as_meal with meal_drink_id and meal_size (medium or large).

# Flow
1. Take items as they come. After each, a short confirmation ("Got it, a Stackhouse Double, no pickles. Anything else?").
2. When they say that's all, call suggest_upsell once and make that single offer in one short sentence, or skip it if there is no suggestion. Accept no immediately.
3. Call read_back and say its text naturally. Ask "Is that all correct?"
4. When they confirm, call submit_order and say its text.
5. If they ask for a person, sound frustrated, or you are stuck, call request_human right away.

# Menu
${menuText()}

Options (modifiers): ${MODIFIER_IDS.join(', ')}.
Burgers and chicken sandwiches can be made plain, or with no or extra pickles, onions, cheese, sauce, lettuce, tomato, or add bacon. Drinks: no ice or light ice. Fries: no salt or extra salt. Cluck Bites sauces: bbq_sauce, honey_mustard, ranch, sweet_chili. Frostee flavors: chocolate, vanilla, strawberry.`

const lineId = { type: 'string', description: 'The line_id from an earlier tool result, like "L2".', pattern: '^[Ll]?[0-9]+$', examples: ['L1', 'L2'] }
const size = { type: 'string', enum: ['small', 'medium', 'large', '6pc', '10pc', '20pc'], description: 'Size. Cluck Bites use 6pc, 10pc or 20pc.' }
const modifiers = { type: 'array', items: { type: 'string', enum: MODIFIER_IDS }, description: 'Options the guest asked for, like no_pickles or extra_cheese.' }
const meal = {
  as_meal: { type: 'boolean', description: 'True when the guest wants it as a meal (adds fries and a drink).' },
  meal_drink_id: { type: 'string', enum: DRINK_IDS.filter((d) => d !== 'bottled_water'), description: 'Drink for the meal.' },
  meal_size: { type: 'string', enum: ['medium', 'large'] },
}

export const TOOLS = [
  {
    type: 'function',
    name: 'add_item',
    description: 'Add an item to the order. Call once per distinct item as soon as the guest asks for it.',
    parameters: {
      type: 'object',
      properties: {
        item_id: { type: 'string', enum: ITEM_IDS, description: 'Menu item id.', examples: ['stackhouse_double', 'cluck_bites', 'frostee'] },
        quantity: { type: 'integer', minimum: 1, description: 'How many. Defaults to 1. Pass exactly what the guest said, even if it seems huge.' },
        size,
        modifiers,
        for_whom: { type: 'string', description: 'Optional, who it is for if the guest says ("for my daughter").' },
        ...meal,
      },
      required: ['item_id'],
    },
  },
  {
    type: 'function',
    name: 'modify_item',
    description: 'Change an existing line: its item, quantity, size, options or meal. Use this for corrections. Quantity 0 removes the line.',
    parameters: {
      type: 'object',
      properties: {
        line_id: lineId,
        item_id: { type: 'string', enum: ITEM_IDS, description: 'New item, only when swapping ("make that a single").' },
        quantity: { type: 'integer', minimum: 0 },
        size,
        add_modifiers: modifiers,
        remove_modifiers: modifiers,
        for_whom: { type: 'string' },
        ...meal,
      },
      required: ['line_id'],
    },
  },
  {
    type: 'function',
    name: 'remove_item',
    description: 'Remove a line from the order.',
    parameters: { type: 'object', properties: { line_id: lineId }, required: ['line_id'] },
  },
  {
    type: 'function',
    name: 'suggest_upsell',
    description: 'Call once, when the guest says that is everything. Returns at most one offer to make.',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function',
    name: 'read_back',
    description: 'Get the exact order summary and total to read back to the guest before submitting.',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function',
    name: 'submit_order',
    description: 'Send the order to the kitchen. Only after read_back and the guest confirms it is correct.',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function',
    name: 'request_human',
    description: 'Hand the guest to a crew member. Use when they ask for a person, are frustrated, or you are stuck.',
    parameters: { type: 'object', properties: { reason: { type: 'string', description: 'Short reason, for the crew.' } } },
  },
]

export const TRANSCRIPTION_PROMPT =
  'A drive-thru order at Stackhouse Burgers, spoken by the driver over car and traffic noise. ' +
  'Expect menu names like Stackhouse Single, Double and Triple, Smokestack BBQ, Garden Stack, Cluckwich, Cluck Bites, Stack Fries, Stack Cola, Fizzy Lemonade, Frostee, Apple Turnover and Stack Pack; ' +
  'sizes; quantities; and options like no pickles, extra cheese or light ice. Guests often correct themselves mid-sentence.'

export function sessionConfig(hearing: HearingOptions = DEFAULT_HEARING) {
  const input: Record<string, unknown> = { format: { encoding: 'audio/pcm' } }
  if (hearing.keyterms) {
    input.keyterms = menuKeyterms()
    input.transcription_prompt = TRANSCRIPTION_PROMPT
  }
  if (hearing.voiceFocus !== 'off') {
    input.voice_focus = hearing.voiceFocus
    if (hearing.voiceFocusThreshold != null) input.voice_focus_threshold = hearing.voiceFocusThreshold
  }
  return {
    system_prompt: SYSTEM_PROMPT,
    greeting: GREETING,
    tools: TOOLS,
    input,
    output: { voice: 'alba', format: { encoding: 'audio/pcm' } },
  }
}
