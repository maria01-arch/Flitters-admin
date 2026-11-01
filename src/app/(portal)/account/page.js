import { getAdvertiserContext } from '@/lib/advertiser'
import { countryName } from '@/lib/countries'
import { day } from '@/lib/format'
import SignOutButton from '@/components/SignOutButton'

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const ctx = await getAdvertiserContext()
  if (ctx.error) return null
  const adv = ctx.advertiser
  return (
    <>
      <h1>Account</h1>
      <section className="card">
        <h2>Your business</h2>
        <dl className="kv">
          <dt>Name</dt><dd>{adv.business_name}</dd>
          <dt>Country</dt><dd>{countryName(adv.country_code)}</dd>
          <dt>Contact email</dt><dd>{adv.contact_email}</dd>
          <dt>Sign-in email</dt><dd>{ctx.user.email}</dd>
          <dt>Joined</dt><dd>{day(adv.created_at)}</dd>
        </dl>
        <p className="hint">Your country sets the currency and price you pay.</p>
      </section>
      <section className="card">
        <h2>Policies</h2>
        <p className="row"><a href="/terms">Terms</a><a href="/ad-policy">Ad policy</a><a href="/refunds">Refunds</a><a href="/privacy">Privacy</a></p>
        {process.env.NEXT_PUBLIC_SUPPORT_EMAIL ? <p className="hint">Need help? Email {process.env.NEXT_PUBLIC_SUPPORT_EMAIL}</p> : null}
      </section>
      <SignOutButton />
    </>
  )
}
