// Summarize live-agent reply latency from the scripted drive-thru runs.
//   npm run latency   ->  bench/latency.json
// Latency = end of the guest's speech (input.speech.stopped) to the first
// audio of the agent's reply, measured from the client.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join('bench', 'runs')
const runs = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
const all = runs.flatMap((r) => (r.latencies ?? []) as number[]).sort((a, b) => a - b)
const q = (p: number) => all[Math.min(all.length - 1, Math.floor(p * all.length))]
const out = { sessions: runs.length, replies: all.length, median: q(0.5), p90: q(0.9), min: all[0], max: all.at(-1), measuredAt: new Date().toISOString() }
writeFileSync(join('bench', 'latency.json'), JSON.stringify(out, null, 2))
console.log(out)
