import LegalPage from '@/components/LegalPage'
import { UPDATED, PRIVACY } from '@/lib/legal'

export const metadata = { title: 'Privacy Policy · Flitters Ads' }

export default function Page() {
  return <LegalPage title="Privacy Policy" updated={UPDATED} sections={PRIVACY} />
}
