import { redirect } from 'next/navigation'
import { getAdvertiserContext } from '@/lib/advertiser'
import Shell from '@/components/Shell'
import AuthShell from '@/components/AuthShell'

export const dynamic = 'force-dynamic'

export default async function PortalLayout({ children }) {
  const ctx = await getAdvertiserContext()
  if (ctx.error === 'signed_out') redirect('/login')
  if (ctx.error === 'no_profile') redirect('/onboarding')
  if (ctx.error === 'suspended') {
    return (
      <AuthShell>
        <h2>Account paused</h2>
        <p>This advertiser account is not active. Contact Flitters support if you think this is a mistake.</p>
      </AuthShell>
    )
  }
  return <Shell business={ctx.advertiser.business_name}>{children}</Shell>
}
