import { getAdvertiserContext } from '@/lib/advertiser'
import { countryName } from '@/lib/countries'
import { r2Configured } from '@/lib/r2'
import CampaignBuilder from '@/components/CampaignBuilder'

export const dynamic = 'force-dynamic'

export default async function CreatePage() {
  const ctx = await getAdvertiserContext()
  if (ctx.error) return null
  const adv = ctx.advertiser
  return <CampaignBuilder initial={null} business={adv.business_name} countryLabel={countryName(adv.country_code)} storageReady={r2Configured()} />
}
