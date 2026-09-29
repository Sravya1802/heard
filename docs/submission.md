# lablab submission — copy/paste

## Project title (letters and spaces only, max 32)
Heard Drive Thru Voice AI

## Short description (max 255 characters)
The drive-thru AI that doesn't make up orders. Built on AssemblyAI's Voice Agent API, Heard hears the driver through road noise and back-seat chatter and builds a verified order: 99% exactly right where generic speech-to-text gets 13%.

## Long description
Drive-thru AI didn't fail because it was dumb. It failed because it couldn't hear. McDonald's pulled its AI drive-thru from more than 100 restaurants in 2024 after viral misheard orders, and Taco Bell slowed its rollout after a caller ordered 18,000 waters just to reach a human.

Heard is a drive-thru voice agent built around hearing. It runs on AssemblyAI's Voice Agent API with Universal-3.6 Pro speech-to-text, voice focus (which AssemblyAI lists for drive-thru speakers) and the menu as key terms, so invented brand names like "Cluckwich" survive engine noise.

One design decision makes it trustworthy: the AI never writes the order. It runs the conversation; a deterministic parser builds the order from what was actually heard, and a tested engine owns every item, price and total. Corrections work even inside one breath ("two Spicy Cluckwiches, actually make one a Double, no pickles… wait, scratch the Frostee"), and every change shows the words it came from and the rule that applied.

What judges can try in the browser:
- Hear it both ways: the same microphone through generic speech-to-text and through Heard, side by side, with the order each would build.
- A noise page for your phone, so you can test it in real drive-thru noise.
- A kitchen screen where tickets fire, update for late add-ons, and a crew alarm when a guest asks for a person.
- A bilingual lane: Spanish, English or both in one sentence.
- Guardrails from the public failures: quantity caps, read-back before sending, one offer only, a human one sentence away, and "Frostee machine down" handled live.

Proof: a reproducible benchmark of 24 order lines in 6 accents under road noise and back-seat chatter. With noise as loud as the driver, generic speech-to-text gets 13% of orders exactly right; Heard gets 99%. Median reply time is 1.25 seconds. 103 automated tests, and scripted scenarios verified against the live agent.

Built so everyone gets understood the first time, any accent, English or Spanish, with a real person always one sentence away. Next: pharmacy drive-thru windows, where a misheard name or drug is a safety risk.

## Technologies / tags
AssemblyAI, Voice Agent API, Universal-3.6 Pro, Streaming Speech-to-Text, Voice Focus, Next.js, TypeScript, Vercel, Voice AI, Drive-thru, Restaurant Tech

## Links
- Demo application: https://<your-vercel-url>
- GitHub repository: https://github.com/Sravya1802/heard
- Demo platform: Vercel
