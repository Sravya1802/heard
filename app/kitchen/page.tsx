import type { Metadata } from 'next'
import Kitchen from '@/components/Kitchen'

export const metadata: Metadata = { title: 'Kitchen · Heard' }

export default function KitchenPage() {
  return <Kitchen />
}
