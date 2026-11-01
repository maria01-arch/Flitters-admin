import { getStaffContext, can } from '@/lib/staff'
import { createAdminClient } from '@/lib/supabase/admin'
import { countryOptions } from '@/lib/countries'
import PricingClient from '@/components/PricingClient'

export const dynamic = 'force-dynamic'

export default async function PricingPage() {
  const ctx = await getStaffContext()
  if (ctx.error) return null
  if (!can(ctx, 'pricing.manage')) {
    return (
      <section className="card">
        <h2>No access</h2>
        <p>Only the Owner, or staff the Owner has given the pricing permission, can set prices.</p>
      </section>
    )
  }
  const admin = createAdminClient()
  const [rules, currencies, countries] = await Promise.all([
    admin.from('ad_price_rules').select('*').order('created_at', { ascending: false }),
    admin.from('payment_currencies').select('*').order('currency'),
    admin.from('country_settings').select('*').order('name'),
  ])
  const error = rules.error || currencies.error || countries.error
  if (error) {
    return (
      <section className="card">
        <h2>Couldn’t load prices</h2>
        <p className="err">{error.message}</p>
      </section>
    )
  }
  return <PricingClient rules={rules.data} currencies={currencies.data} countrySettings={countries.data} countries={countryOptions()} />
}
