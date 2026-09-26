// Everything the Voice Agent API needs to know about Heard, sent inline in the
// first session.update. Tools are client-side: the browser runs them through
// the deterministic order engine and answers with tool.result.
//
// Docs: https://www.assemblyai.com/docs/voice-agents/voice-agent-api/session-configuration

import { MENU, MODIFIER_IDS, formatPrice, menuKeyterms, sizesOf } from './menu'

export type VoiceFocus = 'near-field' | 'far-field' | 'off'

export interface HearingOptions {
  /** `voice_focus` isolates the speaker nearest the mic; "off" is the baseline for comparisons. */
  voiceFocus: VoiceFocus
  voiceFocusThreshold?: number
  /** Menu names as key terms, plus a transcription prompt describing a drive-thru order. */
  keyterms: boolean
  /** Spanish/English lane: a Spanish-native voice that code-switches, and replies in the guest's mix. */
  bilingual?: boolean
  /** Override end-of-turn silence (ms). Unset keeps AssemblyAI's adaptive turn detection. */
  minSilence?: number
  maxSilence?: number
}

export const DEFAULT_HEARING: HearingOptions = { voiceFocus: 'far-field', keyterms: true }

const GREETING = 'Welcome to Stackhouse! What can I get started for you?'
const GREETING_BILINGUAL = '¡Bienvenidos a Stackhouse! Welcome! ¿Qué le sirvo hoy? What can I get you?'

const BILINGUAL_RULES = `

# Language (this lane is bilingual)
- Reply in the language the guest is using. If they mix Spanish and English, reply mostly in Spanish and keep menu names in English (Stackhouse Double, Cluckwich, Frostee, Stack Fries).
- Tool results are in English. Say them in the guest's language, keeping item names, quantities and prices exact.
- Spanish is understood automatically: "sin pepinillos", "papas grandes", "eso es todo", "mejor una sencilla" all work through sync_order like English.`

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
- If something sounds like it came from someone else in the car (a kid, a passenger, a radio), do not act on it. Ask the driver, for example "Should I add the nuggets too?"
- If you did not catch something, ask for just that part again. After two failed tries on the same thing, call request_human.

# How the order gets built
- The order is built automatically from exactly what the guest says. Your job is the conversation.
- Whenever the guest asks to add, change or remove anything, or answers one of your questions (a size, a flavor, a drink, yes to an offer), call sync_order with no arguments before you speak. Do this even if the request sounds like a joke or is impossible: sync_order checks limits and tells you what to say.
- Call at most one tool per reply. Never call two tools at once.
- Describe the order only from what sync_order returns: "changed" is what just happened, "order" is the whole order. Never say something was added unless it is in "changed".
- If the result has "ask", ask exactly that question, briefly. If it has "note", follow it.
- Never state a price or total yourself; only repeat what read_back or submit_order returned.
- If they ask for something we don't sell, say so and suggest the closest item.

# Flow
1. After each sync_order, confirm what changed in a few words, then ask "Anything else?" (or the "ask" question).
2. When they say that's all, call suggest_upsell once and make that single offer in one short sentence, or skip it if there is no suggestion. Accept no immediately.
3. Call read_back and say its text naturally. Ask "Is that all correct?"
4. When they confirm, call submit_order and say its text.
5. If they ask for a person, sound frustrated, or you are stuck, call request_human (no arguments) right away, then tell them a crew member is joining.
6. If they remember something after the order was sent ("oh, and a cola"), that's fine: call sync_order as usual, then read_back and submit_order again to update the same ticket.

# Menu
${menuText()}

Options (modifiers): ${MODIFIER_IDS.join(', ')}.
Burgers and chicken sandwiches can be made plain, or with no or extra pickles, onions, cheese, sauce, lettuce, tomato, or add bacon. Drinks: no ice or light ice. Fries: no salt or extra salt. Cluck Bites sauces: bbq_sauce, honey_mustard, ranch, sweet_chili. Frostee flavors: chocolate, vanilla, strawberry.`

export const TOOLS = [
  {
    type: 'function',
    name: 'sync_order',
    description:
      'Update the order from what the guest just said. Call it, with no arguments, whenever they ask to add, change or remove anything, or answer a question about a size, flavor, drink or offer. ' +
      'Returns what changed, the whole order, and any question to ask.',
    parameters: { type: 'object', properties: {} },
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
    parameters: { type: 'object', properties: {} },
  },
]

export const TRANSCRIPTION_PROMPT_BILINGUAL =
  'A drive-thru order at Stackhouse Burgers. The driver may speak Spanish, English, or mix both in one sentence, over car and traffic noise. ' +
  'Menu names stay in English: Stackhouse Single, Double and Triple, Cluckwich, Cluck Bites, Stack Fries, Stack Cola, Frostee, Apple Turnover.'

export const TRANSCRIPTION_PROMPT =
  'A drive-thru order at Stackhouse Burgers, spoken by the driver over car and traffic noise. ' +
  'Expect menu names like Stackhouse Single, Double and Triple, Smokestack BBQ, Garden Stack, Cluckwich, Cluck Bites, Stack Fries, Stack Cola, Fizzy Lemonade, Frostee, Apple Turnover and Stack Pack; ' +
  'sizes; quantities; and options like no pickles, extra cheese or light ice. Guests often correct themselves mid-sentence.'

export function sessionConfig(hearing: HearingOptions = DEFAULT_HEARING) {
  const input: Record<string, unknown> = { format: { encoding: 'audio/pcm' } }
  if (hearing.keyterms) {
    input.keyterms = menuKeyterms()
    input.transcription_prompt = hearing.bilingual ? TRANSCRIPTION_PROMPT_BILINGUAL : TRANSCRIPTION_PROMPT
  }
  if (hearing.bilingual) input.language_codes = ['en', 'es']
  if (hearing.minSilence || hearing.maxSilence) {
    input.turn_detection = {
      ...(hearing.minSilence ? { min_silence: hearing.minSilence } : {}),
      ...(hearing.maxSilence ? { max_silence: hearing.maxSilence } : {}),
    }
  }
  if (hearing.voiceFocus !== 'off') {
    input.voice_focus = hearing.voiceFocus
    if (hearing.voiceFocusThreshold != null) input.voice_focus_threshold = hearing.voiceFocusThreshold
  }
  return {
    system_prompt: hearing.bilingual ? SYSTEM_PROMPT + BILINGUAL_RULES : SYSTEM_PROMPT,
    greeting: hearing.bilingual ? GREETING_BILINGUAL : GREETING,
    tools: TOOLS,
    input,
    // lola: a Spanish-native voice that also speaks English.
    output: { voice: hearing.bilingual ? 'lola' : 'alba', format: { encoding: 'audio/pcm' } },
  }
}
