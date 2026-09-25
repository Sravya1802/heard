# Heard — the drive-thru AI that actually hears you

> Drive-thru AI didn't fail because it was dumb. It failed because it couldn't hear.

Heard is a voice agent for the drive-thru speaker post, built on the [AssemblyAI Voice Agent API](https://www.assemblyai.com/docs/voice-agents/voice-agent-api). It isolates the driver's voice from engine noise and back-seat chatter, follows mid-sentence corrections, and never invents a price: every item, price and total comes from a deterministic, tested order engine.

The demo restaurant, **Stackhouse Burgers**, is fictional.

## Try it

1. Open **Lane 1** (`/lane`) and press **Pull up to the speaker**. Allow the microphone.
2. Order like a real person: *"Two Stackhouse Doubles… actually make one a single, no pickles."* Try *"eighteen thousand waters"* or *"can I talk to a person?"*
3. Open the **kitchen screen** (`/kitchen`) in another tab: items appear while you talk, and the ticket fires when you confirm.

## How it works

```
Browser /lane ──WebSocket + single-use token──► AssemblyAI Voice Agent API
   │  session.update: system prompt, tools, menu key terms, voice_focus
   │  tool.call ─► lib/order-engine.ts (deterministic) ─► tool.result
   ▼
Next.js API: /api/token · /api/orders · /api/availability ─► Supabase (optional)
                                                   │ realtime broadcast
                                         /kitchen (kitchen display)
```

| AssemblyAI feature | How Heard uses it |
|---|---|
| Voice Agent API (STT + LLM + TTS over one WebSocket) | The whole conversation, with barge-in |
| `voice_focus` (Universal-3.5 Pro Realtime) | Isolates the driver from car noise and back-seat voices |
| `keyterms` + `transcription_prompt` | Invented menu names like *Cluckwich* and *Frostee* |
| Client-side tools with JSON-Schema enums | The model picks menu ids; the engine validates, prices and totals |
| Single-use browser tokens | The API key never reaches the page |

Guardrails from the public failures of drive-thru AI:

- **Pranks:** quantities over 10 per item are refused with a friendly double-check ("18,000 waters?").
- **Corrections:** "actually, make that a single" edits the existing line instead of adding one.
- **Interruptions:** if the guest cuts in before a tool result is delivered, the pending change is rolled back so the board never disagrees with the agent.
- **Human fallback:** one sentence hands the car to a crew member, with an alarm on the kitchen screen.
- **Broken Frostee machine:** the kitchen marks an item down and Heard stops selling it immediately.

## Run it locally

```bash
cp .env.example .env.local   # add ASSEMBLYAI_API_KEY
npm install
npm run dev                   # http://localhost:3000
npm test                      # order engine tests
```

Supabase is optional. Without it, the lane and kitchen sync between tabs of the same browser. To use it, create a project, run `supabase/schema.sql` in the SQL editor, and fill in the three Supabase variables.

## License

MIT
