import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Who is calling, and which business do they own? Everything an advertiser can
// see or do is looked up through THEIR advertiser row, never from the browser.
// Result: { error } or { user, advertiser }.
export const getAdvertiserContext = cache(async () => {
  const supabase = createClient()
  const { data } = await supabase.auth.getUser()
  const user = data && data.user
  if (!user) return { error: 'signed_out' }
  const admin = createAdminClient()
  const { data: advertiser } = await admin.from('advertisers').select('*').eq('user_id', user.id).maybeSingle()
  if (!advertiser) return { error: 'no_profile', user }
  if (advertiser.status !== 'active') return { error: 'suspended', user, advertiser }
  return { user, advertiser }
})
