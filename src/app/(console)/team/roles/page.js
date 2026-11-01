import { getStaffContext, can } from '@/lib/staff'
import { createAdminClient } from '@/lib/supabase/admin'
import RolesClient from '@/components/RolesClient'

export const dynamic = 'force-dynamic'

export default async function RolesPage() {
  const ctx = await getStaffContext()
  if (ctx.error) return null
  if (!can(ctx, 'staff.manage') && !can(ctx, 'roles.manage')) {
    return (
      <section className="card">
        <h2>No access</h2>
        <p>Your role can’t see roles.</p>
      </section>
    )
  }
  const admin = createAdminClient()
  const { data } = await admin.from('staff_roles').select('*').order('created_at')
  return <RolesClient roles={data || []} actorPerms={ctx.permissions} canRoles={can(ctx, 'roles.manage')} />
}
