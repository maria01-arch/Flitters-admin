import { prelude, json, auditFirst, auditFailed, UUID, snip } from '@/lib/apiKit'
import { can } from '@/lib/staff'

export const runtime = 'nodejs'

// Flit coins: edit the gift list and coin packs, and fix a person's balance. Every change is logged first.
export async function POST(req) {
  const p = await prelude(req, { name: 'coins', limit: 60 })
  if (p.res) return p.res
  const { ctx, body, ip, admin } = p
  if (!can(ctx, 'coins.manage')) return json(403, { error: 'You don’t have permission to manage Flit coins' })
  try {
    switch (body.action) {
      case 'save_gift': return await saveGift({ ctx, body, ip, admin })
      case 'save_pack': return await savePack({ ctx, body, ip, admin })
      case 'adjust': return await adjust({ ctx, body, ip, admin })
      case 'save_config': return await saveConfig({ ctx, body, ip, admin })
      case 'handle_withdrawal': return await handleWithdrawal({ ctx, body, ip, admin })
      default: return json(400, { error: 'Unknown action' })
    }
  } catch (err) {
    console.error('Coins route failed:', err)
    return json(500, { error: 'Something went wrong' })
  }
}

const int = (v, min, max) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : null }

async function saveGift({ ctx, body, ip, admin }) {
  const id = String(body.id || '').trim().toLowerCase()
  const name = String(body.name || '').trim()
  const emoji = String(body.emoji || '').trim()
  const cost = int(body.cost, 1, 1000000)
  const sort = int(body.sort ?? 0, 0, 9999)
  if (!/^[a-z0-9_]{2,24}$/.test(id)) return json(400, { error: 'The id must be 2 to 24 letters, numbers or _' })
  if (!name || name.length > 30 || !emoji || emoji.length > 12) return json(400, { error: 'Give the gift a name (up to 30 characters) and an emoji' })
  if (cost == null || sort == null) return json(400, { error: 'Cost must be a whole number of coins' })
  const row = { id, name, emoji, cost, sort, active: body.active !== false }
  const { data: before } = await admin.from('gift_items').select('*').eq('id', id).maybeSingle()
  const base = { action: 'coins.save_gift', targetType: 'gift', targetId: id }
  const bad = await auditFirst(ctx, ip, { ...base, before: before || null, after: row })
  if (bad) return bad
  const { error } = await admin.from('gift_items').upsert(row)
  if (error) { await auditFailed(ctx, ip, base, error.message); return json(500, { error: error.message }) }
  return json(200, { ok: true })
}

async function savePack({ ctx, body, ip, admin }) {
  const sku = String(body.sku || '').trim()
  const coins = int(body.coins, 1, 10000000)
  const sort = int(body.sort ?? 0, 0, 9999)
  if (!/^flitcoins_[a-z0-9_]{1,40}$/.test(sku)) return json(400, { error: 'The product id must start with flitcoins_ and match Play Console exactly' })
  if (coins == null || sort == null) return json(400, { error: 'Coins must be a whole number' })
  const price = body.price_usd_cents == null || body.price_usd_cents === '' ? null : int(body.price_usd_cents, 1, 100000000)
  if (body.price_usd_cents != null && body.price_usd_cents !== '' && price == null) return json(400, { error: 'Price must be a whole number of US cents' })
  const row = { sku, coins, label: snip(String(body.label || '').trim(), 30) || null, sort, active: body.active !== false, price_usd_cents: price }
  const { data: before } = await admin.from('coin_packs').select('*').eq('sku', sku).maybeSingle()
  const base = { action: 'coins.save_pack', targetType: 'coin_pack', targetId: sku }
  const bad = await auditFirst(ctx, ip, { ...base, before: before || null, after: row })
  if (bad) return bad
  const { error } = await admin.from('coin_packs').upsert(row)
  if (error) { await auditFailed(ctx, ip, base, error.message); return json(500, { error: error.message }) }
  return json(200, { ok: true })
}

// Add or take away coins (for example after Google refunds a purchase).
async function adjust({ ctx, body, ip, admin }) {
  const username = String(body.username || '').trim().replace(/^@/, '')
  const delta = int(body.delta, -10000000, 10000000)
  const reason = String(body.reason || '').trim()
  if (!username || delta == null || delta === 0) return json(400, { error: 'Enter a username and a number of coins (use a minus to take away)' })
  if (reason.length < 3 || reason.length > 200) return json(400, { error: 'Write a reason (3 to 200 characters)' })
  const { data: person } = await admin.from('profiles').select('id,username').ilike('username', username).maybeSingle()
  if (!person || !UUID.test(person.id)) return json(404, { error: 'No user with that username' })
  const base = { action: 'coins.adjust', targetType: 'user', targetId: person.id }
  const bad = await auditFirst(ctx, ip, { ...base, before: { requested: delta, reason } })
  if (bad) return bad
  const { data, error } = await admin.rpc('admin_adjust_coins', { p_user: person.id, p_delta: delta, p_reason: reason })
  if (error) { await auditFailed(ctx, ip, base, error.message); return json(500, { error: error.message }) }
  return json(200, { ok: true, applied: data?.applied, balance: data?.balance, username: person.username })
}

async function saveConfig({ ctx, body, ip, admin }) {
  const share = int(body.receiver_share_pct, 0, 100)
  const per = int(body.coins_per_usd, 1, 100000)
  const min = int(body.min_withdraw_coins, 0, 100000000)
  const mode = String(body.web_link_mode || 'off')
  if (!['off', 'allowed_regions', 'always'].includes(mode)) return json(400, { error: 'Bad link mode' })
  const buyUrl = String(body.web_buy_url || '').trim()
  if (!/^https:\/\/[^\s]+$/i.test(buyUrl)) return json(400, { error: 'The website link must start with https://' })
  const opens = new Date(body.withdraw_opens_at)
  if (share == null || per == null || min == null || isNaN(opens.getTime())) return json(400, { error: 'Check the numbers and the date' })
  const row = { id: true, receiver_share_pct: share, coins_per_usd: per, min_withdraw_coins: min, withdraw_opens_at: opens.toISOString(), play_purchase_enabled: body.play_purchase_enabled === true, web_link_mode: mode, web_buy_url: buyUrl }
  const { data: before } = await admin.from('coin_config').select('*').maybeSingle()
  const base = { action: 'coins.save_config', targetType: 'coin_config', targetId: 'main' }
  const bad = await auditFirst(ctx, ip, { ...base, before: before || null, after: row })
  if (bad) return bad
  const { error } = await admin.from('coin_config').upsert(row)
  if (error) { await auditFailed(ctx, ip, base, error.message); return json(500, { error: error.message }) }
  return json(200, { ok: true })
}

// Mark a withdrawal paid (after you sent the money) or reject it (coins go back to the person).
async function handleWithdrawal({ ctx, body, ip, admin }) {
  const id = String(body.id || '')
  const status = String(body.status || '')
  const note = String(body.note || '').trim()
  if (!UUID.test(id) || !['paid', 'rejected'].includes(status)) return json(400, { error: 'Bad request' })
  if (status === 'rejected' && note.length < 3) return json(400, { error: 'Write the reason the person will see' })
  const { data: w } = await admin.from('withdrawal_requests').select('id,user_id,coins,usd_cents,status').eq('id', id).maybeSingle()
  if (!w) return json(404, { error: 'Request not found' })
  const base = { action: 'coins.withdrawal_' + status, targetType: 'user', targetId: w.user_id }
  const bad = await auditFirst(ctx, ip, { ...base, before: { request: id, coins: w.coins, usd_cents: w.usd_cents, status: w.status }, after: { status, note: snip(note, 200) } })
  if (bad) return bad
  const { error } = await admin.rpc('admin_handle_withdrawal', { p_id: id, p_status: status, p_note: note || null })
  if (error) { await auditFailed(ctx, ip, base, error.message); return json(500, { error: error.message }) }
  return json(200, { ok: true })
}
