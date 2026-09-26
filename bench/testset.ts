// The benchmark test set: realistic drive-thru lines with the menu terms that
// must survive transcription. An entity is a list of acceptable spellings.

export interface Utterance {
  text: string
  entities: string[][]
  /** For corrections: what was already ordered before this line (read from text, not audio). */
  setup?: string
}

export const ORDER_LINES: Utterance[] = [
  { text: 'Hi, can I get two Stackhouse Doubles, one with no pickles.', entities: [['2'], ['stackhouse double'], ['no pickles']] },
  { text: 'Let me get a Spicy Cluckwich meal, large, with a Sweet Tea.', entities: [['spicy cluckwich'], ['large'], ['sweet tea']] },
  { text: 'Can I get ten Cluck Bites with honey mustard and ranch.', entities: [['10'], ['cluck bites'], ['honey mustard'], ['ranch']] },
  { text: 'Actually, make that a Stackhouse Single instead, no onions.', entities: [['stackhouse single'], ['no onions']], setup: 'A Stackhouse Double.' },
  { text: 'One medium chocolate Frostee and an Apple Turnover.', entities: [['medium'], ['chocolate'], ['frostee'], ['apple turnover']] },
  { text: "I'll do the Smokestack BBQ with extra cheese and add bacon.", entities: [['smokestack'], ['extra cheese'], ['bacon']] },
  { text: 'Two Stack Packs, one with the mini burger and one with Cluck Bites.', entities: [['2'], ['stack pack'], ['mini burger'], ['cluck bites']] },
  { text: 'Large Stack Fries, no salt, and a medium Diet Stack Cola with light ice.', entities: [['large'], ['stack fries'], ['no salt'], ['medium'], ['diet stack cola'], ['light ice']] },
  { text: 'Can I get a Garden Stack, plain, and a small Fizzy Lemonade.', entities: [['garden stack'], ['plain'], ['small'], ['fizzy lemonade']] },
  { text: 'Give me a Stackhouse Triple meal with a large Stack Cola.', entities: [['stackhouse triple'], ['meal'], ['large'], ['stack cola']] },
  { text: 'Twenty piece Cluck Bites with sweet chili sauce.', entities: [['20'], ['cluck bites'], ['sweet chili']] },
  { text: 'No wait, scratch the onion rings, just a small fries.', entities: [['scratch'], ['onion rings'], ['small'], ['fries']], setup: 'A large onion rings and a Cluckwich.' },
  { text: 'A vanilla Frostee, small, and a strawberry Frostee, large.', entities: [['vanilla'], ['strawberry'], ['frostee'], ['small'], ['large']] },
  { text: 'Can I get a Cluckwich with no tomato and extra sauce.', entities: [['cluckwich'], ['no tomato'], ['extra sauce']] },
  { text: 'Three Stackhouse Singles, all with no pickles, and three waters.', entities: [['3'], ['stackhouse single'], ['no pickles'], ['waters']] },
  { text: 'Make the lemonade a large and add an Apple Turnover.', entities: [['lemonade'], ['large'], ['apple turnover']], setup: 'A small Fizzy Lemonade.' },
  { text: 'I want the Smokestack BBQ meal, medium, with a Fizzy Lemonade.', entities: [['smokestack'], ['meal'], ['medium'], ['fizzy lemonade']] },
  { text: 'Six piece Cluck Bites with barbecue sauce for my daughter.', entities: [['6'], ['cluck bites'], ['barbecue sauce', 'bbq sauce']] },
  { text: 'Two Spicy Cluckwiches and a large onion rings.', entities: [['2'], ['spicy cluckwich'], ['large'], ['onion rings']] },
  { text: 'Can I change the Double to a Triple, and hold the cheese.', entities: [['double'], ['triple'], ['hold the cheese']], setup: 'A Stackhouse Double.' },
  { text: 'One Stackhouse Double, extra pickles, extra onions, no sauce.', entities: [['stackhouse double'], ['extra pickles'], ['extra onions'], ['no sauce']] },
  { text: 'And a medium Sweet Tea, no ice, for my husband.', entities: [['medium'], ['sweet tea'], ['no ice']] },
  { text: "That's it. Oh, and a Garden Stack meal with a Diet Stack Cola.", entities: [['garden stack'], ['meal'], ['diet stack cola']] },
  { text: 'Can I get a large chocolate Frostee and two Apple Turnovers.', entities: [['large'], ['chocolate'], ['frostee'], ['2'], ['apple turnover']] },
]

/** Drivers: a spread of accents, because real lanes don't all sound alike. */
export const DRIVER_VOICES = ['Samantha', 'Daniel', 'Rishi', 'Karen', 'Tessa', 'Moira']

/**
 * Back-seat chatter. Each line carries words that never appear in an order,
 * so any of them showing up in a transcript is background speech leaking in.
 */
export const BACKSEAT_LINES = [
  { text: 'Are we there yet? I am so bored.', leak: ['bored', 'there yet'] },
  { text: 'Grandma said I could have the purple dinosaur toy.', leak: ['grandma', 'purple', 'dinosaur'] },
  { text: 'Can we go to soccer practice after this?', leak: ['soccer', 'practice'] },
  { text: 'My tablet died, can you charge it please?', leak: ['tablet', 'charge'] },
  { text: 'I want to watch the Minecraft video again.', leak: ['minecraft', 'video'] },
  { text: 'Mom, he took my headphones!', leak: ['headphones', 'took my'] },
]
export const BACKSEAT_VOICES = ['Junior', 'Sandy (English (US))', 'Grandma (English (US))']
