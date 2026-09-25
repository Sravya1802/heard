import { getUnavailable, setUnavailable } from '@/lib/store'
import { ITEM_IDS } from '@/lib/menu'

export async function GET() {
  return Response.json({ unavailable: await getUnavailable().catch(() => []) })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const ids = Array.isArray(body?.unavailable) ? body.unavailable.filter((id: unknown) => ITEM_IDS.includes(String(id))) : null
  if (!ids) return Response.json({ error: 'Expected { unavailable: string[] }.' }, { status: 400 })
  await setUnavailable(ids)
  return Response.json({ unavailable: ids })
}
