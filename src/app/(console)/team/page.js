import { getStaffContext, can } from '@/lib/staff'
import { createAdminClient } from '@/lib/supabase/admin'
import { effective, covers } from '@/lib/permissions'
import TeamClient from '@/components/TeamClient'

export const dynamic = 'force-dynamic'

export default async function TeamPage() {
  const ctx = await getStaffContext()
  if (ctx.error) return null
  if (!can(ctx, 'staff.manage')) {
    return (
      <section className="card">
        <h2>No access</h2>
        <p>Your role can’t manage the team.</p>
      </section>
    )
  }
  const admin = createAdminClient()
  const [membersRes, rolesRes, invitesRes] = await Promise.all([
    admin.from('staff_members').select('*').order('created_at'),
    admin.from('staff_roles').select('*').order('created_at'),
    admin.from('staff_invites').select('id,email,role_key,expires_at,created_at').is('accepted_at', null).is('revoked_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }),
  ])
  const roles = rolesRes.data || []
  const roleMap = new Map(roles.map((r) => [r.key, r]))

  const members = await Promise.all(
    (membersRes.data || []).map(async (m) => {
      let email = null
      try {
        const { data } = await admin.auth.admin.getUserById(m.user_id)
        email = data && data.user ? data.user.email : null
      } catch {}
      const role = roleMap.get(m.role_key)
      const isSelf = m.user_id === ctx.user.id
      const isOwner = m.role_key === 'owner'
      return {
        user_id: m.user_id, email, role_key: m.role_key, roleName: role ? role.name : m.role_key,
        extra: m.extra_permissions || [], status: m.status, isSelf, isOwner,
        manageable: !isSelf && !isOwner && covers(ctx.permissions, effective(role, m.extra_permissions)),
      }
    })
  )

  const roleOptions = roles.map((r) => ({ key: r.key, name: r.name, assignable: r.key !== 'owner' && covers(ctx.permissions, r.permissions) }))
  return (
    <TeamClient
      members={members}
      invites={invitesRes.data || []}
      roles={roleOptions}
      actorPerms={ctx.permissions}
      canRoles={can(ctx, 'roles.manage')}
    />
  )
}
