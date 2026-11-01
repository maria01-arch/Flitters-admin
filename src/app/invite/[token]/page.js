import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import InviteClient from '@/components/InviteClient'

export const dynamic = 'force-dynamic'

export default async function InvitePage({ params }) {
  const token = String(params.token || '')
  let invite = null
  let roleName = ''
  if (token.length >= 20 && token.length <= 100) {
    const admin = createAdminClient()
    const hash = crypto.createHash('sha256').update(token).digest('hex')
    const { data } = await admin.from('staff_invites').select('email,role_key,expires_at,accepted_at,revoked_at').eq('token_hash', hash).maybeSingle()
    if (data && !data.accepted_at && !data.revoked_at && new Date(data.expires_at) > new Date()) {
      invite = data
      const { data: role } = await admin.from('staff_roles').select('name').eq('key', data.role_key).maybeSingle()
      roleName = role ? role.name : data.role_key
    }
  }
  let signedInEmail = null
  try {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    signedInEmail = data && data.user ? data.user.email : null
  } catch {}

  return <InviteClient token={token} valid={!!invite} email={invite ? invite.email : ''} roleName={roleName} signedInEmail={signedInEmail} />
}
