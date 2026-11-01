import { redirect } from 'next/navigation'
import { getAdvertiserContext } from '@/lib/advertiser'
import { countryOptions } from '@/lib/countries'
import OnboardingClient from '@/components/OnboardingClient'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const ctx = await getAdvertiserContext()
  if (ctx.error === 'signed_out') redirect('/login')
  if (!ctx.error || ctx.error === 'suspended') redirect('/')
  return <OnboardingClient email={ctx.user.email} countries={countryOptions()} />
}
