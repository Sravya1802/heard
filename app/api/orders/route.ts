import { recentOrders, saveOrder } from '@/lib/store'
import type { SubmittedOrder } from '@/lib/realtime'

export async function GET() {
  try {
    return Response.json({ orders: await recentOrders() })
  } catch (error) {
    console.error(error)
    return Response.json({ orders: [], error: 'Could not load orders.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const order = (await request.json().catch(() => null)) as SubmittedOrder | null
  if (!order || typeof order.orderNumber !== 'number' || !Array.isArray(order.lines) || order.lines.length > 30) {
    return Response.json({ error: 'Invalid order.' }, { status: 400 })
  }
  try {
    await saveOrder({ ...order, submittedAt: order.submittedAt || Date.now() })
    return Response.json({ ok: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Could not save the order.' }, { status: 500 })
  }
}
