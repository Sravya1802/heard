// Create or update Heard as a stored Voice Agent (needed to bring your own LLM).
//
//   npx tsx scripts/publish-agent.ts                      # managed LLM
//   npx tsx scripts/publish-agent.ts --llm <base_url> <model> [api_key]
//   npx tsx scripts/publish-agent.ts --id <agent_id> ...   # update in place
//
// Prints the agent id. Tools stay client-handled (no `http`), so the browser
// still runs them through the order engine.

import { sessionConfig } from '../lib/agent-config'
import { loadEnv } from './audio'

loadEnv()
const KEY = process.env.ASSEMBLYAI_API_KEY!
const API = 'https://agents.assemblyai.com/v1'

function arg(name: string, n = 1): string[] | undefined {
  const i = process.argv.indexOf('--' + name)
  return i > 0 ? process.argv.slice(i + 1, i + 1 + n) : undefined
}

async function main() {
  const cfg = sessionConfig()
  const body: Record<string, unknown> = {
    name: process.argv.includes('--name') ? arg('name')![0] : 'Heard drive-thru',
    system_prompt: cfg.system_prompt,
    greeting: cfg.greeting,
    voice: { voice_id: cfg.output.voice },
    input: cfg.input,
    output: { voice: cfg.output.voice, format: cfg.output.format },
    tools: cfg.tools,
  }
  const llm = arg('llm', 3)
  if (llm) body.llm = [{ base_url: llm[0], model: llm[1], api_key: llm[2] && !llm[2].startsWith('--') ? llm[2] : KEY }]

  const id = arg('id')?.[0]
  const res = await fetch(id ? `${API}/agents/${id}` : `${API}/agents`, {
    method: id ? 'PUT' : 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) { console.error(res.status, text); process.exit(1) }
  const agent = JSON.parse(text)
  console.log(agent.id)
}
main()
