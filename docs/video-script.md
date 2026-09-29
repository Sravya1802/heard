# Heard — video script (target 3:45–4:15)

**Setup:** laptop running `/lane` (English) with the kitchen screen in a second window, phone playing `/noise` about 1 m from the laptop, decibel-meter app visible if you have one. Record the screen with OBS (screen + mic + app audio) and the webcam as a small picture-in-picture. Speak clearly and a bit slower than normal.

Timings are targets. Narration is what you say over the recording; **LIVE** means you are actually ordering and the agent is answering.

---

## 0:00–0:20 — Hook (the side-by-side)
**On screen:** Lane 1, "Hear it both ways" panel large. Noise phone playing.

**LIVE (you, into the laptop):** "Two Spicy Cluckwiches and a large onion rings." 

**Narration (over the result):**
> "Same microphone. Same traffic noise. On the left, what a typical drive-thru AI hears. On the right, Heard. One of these gets your order right."

## 0:20–0:50 — The problem
**On screen:** landing page hero, then the two headlines (McDonald's / Taco Bell), then the Insights headline tiles.

> "In 2024 McDonald's pulled its AI drive-thru from over a hundred restaurants after viral videos of wrong orders — like nine sweet teas instead of one. Taco Bell slowed its rollout after one customer ordered eighteen thousand waters just to reach a human.
> These weren't intelligence failures. They were hearing failures. A drive-thru is the hardest place for a voice AI to listen: engines, traffic, kids in the back seat, and people who change their mind mid-sentence."

## 0:50–2:20 — Live demo, one continuous take
**On screen:** Lane 1 on the left, kitchen screen on the right. Noise playing the whole time. Don't cut inside this section. Scenario button: **"Changes their mind"**.

Say, naturally (the agent answers between each):
1. **The killer line, in one breath:** "Can I get two Spicy Cluckwiches, actually make one of those a Stackhouse Double, no pickles, and a large chocolate Frostee. Wait, scratch the Frostee."
   > *(point at "How Heard decided")* "Four corrections in one breath. Every change shows the words it came from and the rule that applied. The AI never writes the order."
   > *(point at "Hear it both ways")* "And here's the same sentence through generic speech-to-text: 'clock witches'. That's the order a typical drive-thru AI would have made."
2. "Can I get eighteen thousand waters?"
   > "Capped. Heard double-checks instead of sending it to the kitchen."
3. "That's all." → answer the one offer with "No thanks." → read-back → "Yes, that's right."
   > "The ticket fires: No Pickles in red. Nobody touched a keyboard."
4. "Oh wait — can I also get a large Stack Cola?"
   > "Late add-ons update the same ticket, like a real crew would."

**Optional 10 s:** on the kitchen screen, switch **Frostee machine → DOWN**, then ask for a Frostee. Heard apologizes and offers an Apple Turnover.

## 2:20–2:45 — Spanglish
**On screen:** switch to "Español + English", start a new car.

**LIVE:** "Hola, quiero dos Stackhouse Doubles, una sin pepinillos… y unas papas grandes."
> "Many drive-thru customers mix Spanish and English. Heard understands both in one sentence, answers in the guest's language, and builds the same exact order."

## 2:45–3:25 — The proof
**On screen:** `/insights` — headline tiles, then the chart, then "What each setup actually heard".
> "We didn't just demo it. We measured it. Twenty-four real-world order lines, six accents, streamed through AssemblyAI in real time under road noise and back-seat chatter.
> With noise as loud as the driver's voice, generic speech-to-text gets thirteen percent of orders exactly right. Heard gets ninety-nine.
> The difference is hearing: AssemblyAI's Universal-3.6 Pro, voice focus — which AssemblyAI lists for drive-thru speakers — and our menu as key terms, so 'Cluckwich' doesn't become 'clock witch'."

## 3:25–3:50 — How it's built
**On screen:** architecture slide, then the "Under the hood" panel on Lane 1.
> "Heard runs on AssemblyAI's Voice Agent API: speech-to-text, the LLM and the voice over one connection, with barge-in.
> One design decision matters most: the AI never writes the order. It runs the conversation; a deterministic parser builds the order from what was actually heard, and a tested engine owns every price. Same words, same order, every time. Median reply time: one and a quarter seconds."

## 3:50–4:15 — Business and close
**On screen:** business slide, then the landing page with the live URL.
> "Every chain is trying voice AI at the drive-thru. Heard is the hearing layer: sold per lane, with accuracy you can measure before you deploy, and a human always one sentence away. It's built so everyone gets understood the first time — any accent, English or Spanish.
> Drive-thrus first. Next: pharmacy drive-thru windows, where a misheard name or drug isn't an inconvenience, it's a safety risk.
> Pull up and try it yourself — the link's below. Put your phone on the noise page, and watch both columns."

---

## Recording checklist
- [ ] Headphones on (the agent's voice should not reach the laptop mic)
- [ ] Phone noise at a steady, loud volume; a decibel app in frame is a bonus
- [ ] Chrome, `/lane` freshly loaded, kitchen window open and visible
- [ ] One practice run first; keep the best continuous take of the demo section
- [ ] Final length between 3:30 and 4:30 (under 3:00 caps Presentation at 2)
- [ ] Export 1080p MP4, under 300 MB
