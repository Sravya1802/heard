import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { redirect } from 'next/navigation'

// The newest saved replay. Falls back to the live lane if none exist yet.
export default function ReplayIndex() {
  let first: string | undefined
  try {
    first = JSON.parse(readFileSync(join(process.cwd(), 'public', 'replays', 'index.json'), 'utf8'))[0]?.id
  } catch { /* no replays yet */ }
  redirect(first ? `/replay/${first}` : '/lane')
}
