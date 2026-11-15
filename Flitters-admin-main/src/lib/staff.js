import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Works out who is calling and what they may do. Every page and API route
// calls this on the server, so hiding a button is never the only protection.
// Result: { error } or { user, member, role, permissions }.
async function load(requireMfa) {
  const supabase = createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData?.user
  if (!user) return { error: 'signed_out' }

  if (requireMfa) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (!aal || aal.currentLevel !== 'aal2') return { error: 'mfa_required', user }
  }

  const admin = createAdminClient()
  const { data: member } = await admin
    .from('staff_members')
    .select('user_id, role_key, extra_permissions, status')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member || member.status !== 'active') return { error: 'not_staff', user }

  const { data: role } = await admin
    .from('staff_roles')
    .select('key, name, permissions')
    .eq('key', member.role_key)
    .maybeSingle()

  const permissions = Array.from(new Set([...(role?.permissions || []), ...(member.extra_permissions || [])]))
  return { user, member, role, permissions }
}

// For pages: looked up once per request.
export const getStaffContext = cache(() => load(true))

// For API routes. requireMfa=false is only for the "check" step during sign-in.
export function getStaffForApi(requireMfa = true) {
  return load(requireMfa)
}

export function can(ctx, permission) {
  if (!ctx || !ctx.permissions) return false
  return ctx.permissions.includes('*') || ctx.permissions.includes(permission)
}
