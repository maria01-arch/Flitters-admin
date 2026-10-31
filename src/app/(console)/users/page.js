import { redirect } from 'next/navigation'
import { getStaffContext, can } from '@/lib/staff'
import { createAdminClient } from '@/lib/supabase/admin'
import { utc } from '@/lib/format'

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

  let results = null
  let error = null
  if (raw) {
    // Keep only letters, numbers and a few safe characters before searching.
    const q = raw.replace(/[^\p{L}\p{N}_.\- ]/gu, '').trim().slice(0, 30)
    if (q.length >= 2) {
      const admin = createAdminClient()
      const res = await admin
        .from('profiles')
        .select('id,username,display_name,verified,is_authentic,created_at')
        .or('username.ilike.%' + q + '%,display_name.ilike.%' + q + '%')
        .order('created_at', { ascending: false })
        .limit(20)
      results = res.data || []
      error = res.error ? res.error.message : null
    } else {
      results = []
    }
  }

  return (
    <>
      <h1>Users</h1>
      <form method="get" action="/users" className="searchbar">
        <input name="q" defaultValue={raw} placeholder="Username, name, or user ID" aria-label="Search users" />
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </form>

      {error ? <p className="err">{error}</p> : null}
      {results && results.length === 0 ? (
        <section className="card">
          <p>No one found. Type at least 2 letters of a username or name.</p>
        </section>
      ) : null}
      {results && results.length > 0 ? (
        <section className="card">
          <ul className="rows">
            {results.map((u) => (
              <li key={u.id}>
                <a className="rowlink" href={'/users/' + u.id}>
                  <span>
                    {u.display_name} <small>@{u.username}</small>
                  </span>
                  <small>
                    {u.is_authentic ? 'Blue badge · ' : ''}
                    {u.verified ? 'Gold ring · ' : ''}joined {utc(u.created_at).slice(0, 10)}
                  </small>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}
