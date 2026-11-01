import { redirect } from 'next/navigation'
import { getAdvertiserContext } from '@/lib/advertiser'
import AuthShell from '@/components/AuthShell'

export const dynamic = 'force-dynamic'

// The campaign builder runs without the tab bar so nothing distracts from it.
export default async function BuilderLayout({ children }) {
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
  return <div className="app">{children}</div>
}
