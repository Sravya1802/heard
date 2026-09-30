# Heard — the drive-thru AI that actually hears you

> Drive-thru AI didn't fail because it was dumb. It failed because it couldn't hear.

Heard is a voice agent for the drive-thru speaker post, built on the [AssemblyAI Voice Agent API](https://www.assemblyai.com/docs/voice-agents/voice-agent-api). It picks out the driver's voice from engine noise and back-seat chatter, builds the order **only from what it heard**, follows mid-sentence corrections, never invents a price, and puts a human one sentence away.

**Try it:** `/lane` (order out loud) · `/lane?lang=es` (Spanish/English lane) · `/kitchen` (kitchen display, open it in a second tab) · `/noise` (open on your phone for drive-thru noise) · `/replay` (a recorded real order) · `/insights` (the benchmark)

**Hear it both ways.** While you order, the same microphone audio also goes to a generic speech-to-text setup (an older AssemblyAI streaming model with no menu hints and no voice focus). Lane 1 shows every sentence as both heard it, and the order each would have built, so you can watch the difference live with noise playing from your phone.

**Order confidence.** Five checks turn green as the order earns them: Heard heard you, the order was built from your words (not by the AI), corrections were applied, chatter and pranks were kept off, and the order was read back. When the guest confirms, all five land full-screen before the ticket fires, and "How Heard decided" shows the words and the rule behind every change.

**Habla español? Order in Spanglish.** The bilingual lane understands Spanish, English, or both in one sentence (*"quiero dos Stackhouse Doubles, una sin pepinillos, y unas papas grandes"*), answers in the guest's language with a Spanish-native voice, and builds the same exact order.

The demo restaurant, **Stackhouse Burgers**, is fictional. Its menu names (*Cluckwich*, *Frostee*, *Smokestack BBQ*) are invented on purpose: made-up brand names are exactly what generic speech-to-text gets wrong.

## The problem

- **McDonald's** ended its IBM AI drive-thru test in June 2024 and pulled it from 100+ restaurants after viral videos of misheard orders, such as nine sweet teas instead of one. ([CNBC](https://www.cnbc.com/2024/06/17/mcdonalds-to-end-ibm-ai-drive-thru-test.html))
- **Taco Bell** slowed its AI drive-thru rollout after glitches and trolling, including a caller who ordered 18,000 waters to get through to a human. ([Jalopnik](https://www.jalopnik.com/1956939/taco-bell-drive-through-18000-waters/))

A drive-thru is the hardest place for a voice agent to listen: engine rumble, passing traffic, kids in the back seat, a cheap speaker a metre away, and guests who change their mind mid-sentence. More sources: [docs/sources.md](docs/sources.md).

## Results

**Orders that come out exactly right.** 24 real-world order lines, 6 voices with different English accents, streamed through AssemblyAI in real time with noise running the whole session. Each cell is the mean of 2–3 sessions.

| Condition | Previous-gen streaming STT | Universal-3.6 Pro | + menu key terms & prompt | **Heard** (+ voice focus) |
|---|---|---|---|---|
| Quiet lane | 58% | 69% | 97% | **100%** |
| Road noise, 10 dB | 63% | 63% | 96% | **100%** |
| Road noise, 5 dB | 46% | 58% | 100% | **100%** |
| Road noise, 0 dB (as loud as the driver) | **13%** | 63% | 97% | **99%** |
| Back-seat chatter, 5 dB | 54% | 79% | 100% | **100%** |
| Road + back seat, 5 dB | 38% | 58% | 93% | **96%** |

Without menu key terms, even a strong model hears *Cluckwich* as "Clarkwich", *Cluck Bites* as "Clark bites" and *Frostee* as "Frisbee". Full numbers, word error rates and the transcripts: `/insights` and [bench/results.json](bench/results.json).

**Reply time:** median **1.25 s** from the end of the driver's speech to the agent's first audio (p90 1.68 s), over 81 replies in 41 live Voice Agent sessions ([bench/latency.json](bench/latency.json)).

## How it works

```
Driver ─mic─► Browser /lane ──WebSocket + single-use token──► AssemblyAI Voice Agent API
                  │                                          (Universal-3.6 Pro STT, LLM, TTS)
                  │  transcript.user  ─────────────────────► queued final transcripts
                  │  tool.call sync_order {} ──► lib/order-parser.ts ─► lib/order-engine.ts
                  │  tool.result  ◄── what changed, the whole order, what to ask next
                  ▼
        /api/orders · /api/availability ─► Supabase (optional) ─► /kitchen (realtime)
```

### The key design decision: the model never writes the order

We started with the usual design: the LLM calls `add_item(item_id, quantity, size, …)` and the app validates it. Live testing against the managed Voice Agent LLM showed that whenever one turn needed **more than one change** ("a Single and a Double", or "make one of those a single" plus an addition), the agent returned an **empty reply**: no speech and no tool call. The same happened for any nested tool schema. Parameterless tools were called reliably, in about 0.3 s.

So Heard splits the job:

- **The model runs the conversation.** Whenever the guest asks for anything, it calls `sync_order` with **no arguments**.
- **A deterministic parser builds the order from AssemblyAI's final transcripts**: items, quantities, sizes, flavors, options, meals, split lines ("two Doubles, one with no pickles"), corrections ("scratch the onion rings", "make the lemonade a large", "change the Double to a Triple") and short answers to the agent's questions ("large", "sure").
- **A tested engine** owns every item, price and total, and returns what changed and what to ask next.
- **Every tool call syncs first**, so nothing the guest said is lost if the model jumps straight to the read-back.
- **Safety net:** if the model ever returns an empty reply, the app syncs the order itself and re-prompts with exact instructions.

The result: the same words always produce the same order, and order accuracy depends only on how well the words were heard. That is also what makes the benchmark meaningful: it runs every transcript through the same parser as the live agent.

### AssemblyAI features used

| Feature | How Heard uses it |
|---|---|
| Voice Agent API (STT + LLM + TTS on one WebSocket) | The whole conversation, with barge-in: interrupt the agent and it stops mid-word |
| `voice_focus: far-field` | Isolates the driver. AssemblyAI's docs list drive-thru speakers as the far-field use case |
| `keyterms` + `transcription_prompt` | Invented menu names survive transcription |
| Client-side tools + `tool.result` | `sync_order`, `suggest_upsell`, `read_back`, `submit_order`, `request_human` |
| Single-use browser tokens | The API key never reaches the page |
| Session history (`timeline.json`, recording) | Latency stats and the recorded-order replays |
| Universal-3.6 Pro streaming STT | The noise benchmark |

### Guardrails, from the public failures

| Failure | Heard |
|---|---|
| Nine sweet teas instead of one | Quantities are parsed deterministically and read back before anything reaches the kitchen |
| 18,000 waters | Quantity caps (10 per item, 25 per car) with a friendly double-check |
| Pranking the bot to reach a human | "Can I talk to a person?" hands the car to the crew, with an alarm on the kitchen screen |
| Changing your mind mid-sentence | Corrections edit the existing line instead of adding a duplicate |
| Interrupting the agent | Pending changes roll back if the reply is cut off, so the board never disagrees with the agent |
| The broken ice-cream machine | The kitchen marks the Frostee machine down and Heard stops selling it immediately |
| Pushy upselling | At most one offer per order |

## Run it

```bash
cp .env.example .env.local     # add ASSEMBLYAI_API_KEY
npm install
npm run dev                     # http://localhost:3000
npm test                        # parser, engine, sync and comparison: 99 tests
```

Supabase is optional. Without it, the lane and kitchen sync between tabs of the same browser. To use it, create a project, run [supabase/schema.sql](supabase/schema.sql), and fill in the Supabase variables.

### Reproduce the evidence

```bash
npm run drive -- all            # 5 spoken scenarios against the live agent (macOS voices, no mic needed)
npm run noise && npm run bench -- --reps 3   # the noise benchmark (~75 min, well under $2)
npm run latency                 # reply-time stats from the recorded runs
npm run replay -- <session_id> --title "..."  # save a real session as a static replay
```

## Honest limits

- The benchmark uses synthetic voices (macOS text-to-speech) and generated noise, not recordings from a real lane.
- Voice focus did not stop our synthetic back-seat voices from appearing in transcripts. Those words never became order items, because the order is parsed only against the menu.
- The parser covers a real drive-thru's common phrasings, not every possible sentence; when it can't match something it says so and the agent asks again.

## Repo map

| Path | What |
|---|---|
| `lib/order-parser.ts` | Transcript → order changes (deterministic) |
| `lib/order-engine.ts` | Items, prices, totals, guardrails, read-back, upsell |
| `lib/sync.ts` | Glue between agent tool calls, transcripts and the engine |
| `lib/shadow-stt.ts`, `lib/compare.ts` | The generic transcriber and turn-by-turn comparison for "Hear it both ways" |
| `lib/voice-client.ts` | Browser Voice Agent client: audio worklets, barge-in, deferred tool commits |
| `lib/agent-config.ts` | System prompt, tools, key terms, voice focus |
| `components/Lane.tsx` | The speaker post and order board |
| `components/Kitchen.tsx` | Kitchen display |
| `scripts/` | Scenario runner, benchmark, noise generator, replay saver |

## License

MIT
