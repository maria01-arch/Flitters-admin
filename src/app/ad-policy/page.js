import LegalPage from '@/components/LegalPage'
import { UPDATED, AD_POLICY } from '@/lib/legal'

export const metadata = { title: 'Ad Policy · Flitters Ads' }

export default function Page() {
  return <LegalPage title="Ad Policy" updated={UPDATED} sections={AD_POLICY} />
}
