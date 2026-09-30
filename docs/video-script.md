# Heard — video script (about 4 minutes)

Read it top to bottom, in this order. **Bold quotes** are what you say. *Italics* are what you do.
"YOU ORDER" lines are said to Heard; everything else is you talking to the judges.
No camera needed: screen + your voice.

---

## Before you press record

1. Headphones on. System Settings → Sound → Input → **MacBook Pro Microphone**.
2. Phone about 1 m away playing **heard-lyart.vercel.app/noise**, loud but quieter than your voice.
3. Chrome: **heard-lyart.vercel.app/lane** on the left, **/kitchen** in a second window on the right.
4. Scenario button **"Changes their mind"** selected.
5. Preview: `docs/deck/heard-deck.pdf` open on **slide 2**, full screen (⇧⌘F), ready to ⌘Tab to.
6. OBS: start recording.

---

## 1. Opening — 0:00 to 0:15 (on `/lane`)

**"Hi, I'm Sravya, and this is Heard: a drive-thru voice agent built on AssemblyAI's Voice Agent API. Drive-thru AI has failed in public because it couldn't hear people. Heard is built around hearing. This is live, no edits, with traffic noise playing from my phone. Let's pull up."**

*Click **Pull up to the speaker**. Heard says "Welcome to Stackhouse! What can I get started for you?"*

## 2. Live demo — 0:15 to 1:55 (on `/lane` + kitchen, don't stop recording)

**YOU ORDER, in one breath:** "Can I get two Spicy Cluckwiches, actually make one of those a Stackhouse Double, no pickles, and a large chocolate Frostee. Wait, scratch the Frostee."

*Wait for Heard to answer. Then point at each panel as you talk:*

- *Order confidence:* **"I changed my mind twice in one breath. Both corrections landed, and so did no pickles."**
- *How Heard decided:* **"Every change shows the exact words it came from and the rule that applied. The AI never writes the order."**
- *Hear it both ways:* **"And this is the same sentence through generic speech-to-text. Every mistake is in red, and underneath is the wrong order a typical drive-thru AI would have made."**

**YOU ORDER:** "Can I get eighteen thousand waters?"

**"That's the prank that hit Taco Bell. Heard refuses and double-checks, instead of sending it to the kitchen."**

**YOU ORDER:** "That's all."
*Heard offers one upsell.* **YOU ORDER:** "No thanks."
*Heard reads the order back.* **YOU ORDER:** "Yes, that's right."

*The full-screen Order confidence card appears. Leave it up; talk over it:*

**"Heard it, built it from my words, applied the corrections, ignored the prank, and read it back. Five for five, and only then does it go to the kitchen."**

*Click to close it. Point at the kitchen window:*

**"The ticket fires with No Pickles in red. Nobody touched a keyboard."**

**YOU ORDER:** "Oh wait, can I also get a large Stack Cola?" *(if Heard asks you to confirm, say "Yes")*

**"Late add-ons update the same ticket, like a real crew would."**

## 3. Spanglish — 1:55 to 2:15 (on `/lane?lang=es`)

*Click **Español + English** at the top, then **Pull up to the speaker**.*

**YOU ORDER** (an accent is fine, that's the point):
*OH-lah, kee-EH-roh DOHS Stackhouse Doubles, OO-nah seen peh-pee-NEE-yohs… ee OO-nahs PAH-pahs GRAHN-dehs.*
("Hola, quiero dos Stackhouse Doubles, una sin pepinillos… y unas papas grandes." = two Doubles, one with no pickles, and large fries.)

**"I don't speak Spanish, but plenty of drive-thru customers mix Spanish and English. Heard understands both in one sentence, answers in the guest's language, and builds the same exact order."**

*Click **Drive away (end)**.*

If this didn't work in your practice run: skip ordering, just show the Español + English button and say the line above.

## 4. The problem — 2:15 to 2:45 (slide 2)

*⌘Tab to Preview (slide 2).*

**"Why does this matter? In 2024, McDonald's pulled its AI drive-thru from over a hundred restaurants after viral videos of wrong orders, like nine sweet teas instead of one. Taco Bell slowed its rollout after someone ordered eighteen thousand waters just to reach a human. These weren't intelligence failures. They were hearing failures. A drive-thru is the hardest place to listen: engines, traffic, kids in the back seat, and people who change their mind mid-sentence."**

## 5. The proof — 2:45 to 3:25 (slide 6)

*Right arrow to slide 6.*

**"We didn't just demo it, we measured it. Twenty-four real-world order lines, six accents, streamed through AssemblyAI in real time with road noise and back-seat chatter. With noise as loud as the driver, generic speech-to-text gets thirteen percent of orders exactly right. Heard gets ninety-nine. The difference is hearing: AssemblyAI's Universal-3.6 Pro, voice focus, which AssemblyAI lists for drive-thru speakers, and our menu as key terms, so 'Cluckwich' doesn't become 'clock witch'."**

## 6. How it's built — 3:25 to 3:50 (slide 8)

*Right arrow to slide 8.*

**"Heard runs on AssemblyAI's Voice Agent API: speech-to-text, the language model and the voice over one connection, with barge-in. The key design decision: the AI never writes the order. It runs the conversation, a deterministic parser builds the order from what was actually heard, and a tested engine owns every price. Same words, same order, every time, with a median reply time of about one and a quarter seconds."**

## 7. Business and close — 3:50 to 4:15 (slide 10)

*Right arrow to slide 10.*

**"Every big chain is trying voice AI at the drive-thru. Heard is the hearing layer: sold per lane, with accuracy you can measure before you deploy, and a human always one sentence away. It's built so everyone gets understood the first time, any accent, English or Spanish. Next, pharmacy drive-thru windows, where a misheard name or drug is a safety risk. Try it yourself at heard-lyart.vercel.app. Put your phone on the noise page and watch both columns. Thanks!"**

*Stop recording.*

---

## Tips
- Do one practice run of section 2 first and play it back: you should hear **both** your voice and Heard's.
- Speak a little slower than normal. If Heard says something unexpected, just answer it naturally and keep going.
- If a take goes badly, start again. Two or three takes is normal.
- Final length 3:30 to 4:30 (under 3:00 caps the Presentation score). Trim the start and end in QuickTime (⌘T).
- Optional extra 10 s if you're short: on the kitchen screen set **Frostee machine → DOWN**, then ask Heard for a Frostee. It apologizes and offers an Apple Turnover.
