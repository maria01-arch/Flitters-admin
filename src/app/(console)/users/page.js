import { redirect } from 'next/navigation'
import { getStaffContext, can } from '@/lib/staff'
import UserSearch from '@/components/UserSearch'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function UsersPage({ searchParams }) {
  const ctx = await getStaffContext()
  if (ctx.error) return null
  if (!can(ctx, 'users.view')) {
    return (
      <section className="card">
        <h2>No access</h2>
        <p>Your role can’t look up users.</p>
      </section>
    )
  }
  const raw = String((searchParams && searchParams.q) || '').trim()
  if (UUID.test(raw)) redirect('/users/' + raw)

  return (
    <>
      <div className="phead"><div><h1>Users</h1><p className="lead">Find anyone by username, name or user ID. Open a profile to ban, unban or give a badge.</p></div></div>
      <UserSearch initialQ={raw} />
    </>
  )
}
