import LegalPage from '@/components/LegalPage'
import { UPDATED, TERMS } from '@/lib/legal'

export const metadata = { title: 'Terms of Service · Flitters Ads' }

export default function Page() {
  return <LegalPage title="Terms of Service" updated={UPDATED} sections={TERMS} />
}
