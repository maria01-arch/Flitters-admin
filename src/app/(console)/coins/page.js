import { getStaffContext, can } from '@/lib/staff'
import { createAdminClient } from '@/lib/supabase/admin'
import CoinsClient from '@/components/CoinsClient'

export const dynamic = 'force-dynamic'

export default async function CoinsPage() {
  const ctx = await getStaffContext()
  if (ctx.error) return null
  if (!can(ctx, 'coins.manage')) {
    return (
      <section className="card">
        <h2>No access</h2>
        <p>Your role can’t manage Flit coins.</p>
      </section>
    )
  }
  const admin = createAdminClient()
  const [gifts, packs, buys, sent, cfgR, wdR] = await Promise.all([
    admin.from('gift_items').select('*').order('sort'),
    admin.from('coin_packs').select('*').order('sort'),
    admin.from('coin_purchases').select('id,user_id,sku,coins,created_at').order('created_at', { ascending: false }).limit(25),
    admin.from('gifts_sent').select('id,sender_id,receiver_id,emoji,gift_name,cost,context,created_at').order('created_at', { ascending: false }).limit(25),
    admin.from('coin_config').select('*').maybeSingle(),
    admin.from('withdrawal_requests').select('id,user_id,coins,usd_cents,status,note,created_at').order('created_at', { ascending: false }).limit(50),
  ])
  if (gifts.error || packs.error) {
    return (
      <section className="card">
        <h2>Couldn’t load Flit coins</h2>
        <p className="err">{(gifts.error || packs.error).message}</p>
        <p className="hint">If a table does not exist, run BATCH9_run_this.sql in Supabase.</p>
      </section>
    )
  }
  const ids = Array.from(new Set([...(wdR.data || []).map((r) => r.user_id), ...(buys.data || []).map((r) => r.user_id), ...(sent.data || []).flatMap((r) => [r.sender_id, r.receiver_id])]))
  const pr = ids.length ? await admin.from('profiles').select('id,username').in('id', ids) : { data: [] }
  const name = new Map((pr.data || []).map((p) => [p.id, p.username || 'user']))
  const activity = [
    ...(buys.data || []).map((r) => ({ id: 'b' + r.id, at: r.created_at, text: '@' + name.get(r.user_id) + ' bought ' + r.coins.toLocaleString() + ' coins' })),
    ...(sent.data || []).map((r) => ({ id: 'g' + r.id, at: r.created_at, text: '@' + name.get(r.sender_id) + ' sent ' + r.emoji + ' ' + r.gift_name + ' (' + r.cost + ') to @' + name.get(r.receiver_id) + ' · ' + r.context })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 40)
  const withdrawals = (wdR.data || []).map((r) => ({ ...r, username: name.get(r.user_id) || 'user' }))
  return <CoinsClient gifts={gifts.data || []} packs={packs.data || []} activity={activity} config={cfgR.data} withdrawals={withdrawals} />
}
