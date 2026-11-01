import LegalPage from '@/components/LegalPage'
import { UPDATED, REFUNDS } from '@/lib/legal'

export const metadata = { title: 'Refund Policy · Flitters Ads' }

export default function Page() {
  return <LegalPage title="Refund Policy" updated={UPDATED} sections={REFUNDS} />
}
