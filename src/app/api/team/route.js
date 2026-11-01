import crypto from 'crypto'
import { headers } from 'next/headers'
import { can } from '@/lib/staff'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAudit, clientIp } from '@/lib/audit'
import { rateLimited } from '@/lib/rateLimit'
import { prelude, json, UUID, snip, auditFirst, auditFailed } from '@/lib/apiKit'
import { PERMISSION_KEYS, effective, covers } from '@/lib/permissions'
import { sendEmail, esc } from '@/lib/email'

export const runtime = 'nodejs'

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RESERVED = ['owner', 'trusted', 'admin', 'moderator', 'ads_manager', 'support']

export async function POST(req) {
  let body
  try { body = await req.json() } catch { return json(400, { error: 'Bad request' }) }

  // Accepting an invite is done by someone who is not staff yet.
  if (body.action === 'accept_invite') return acceptInvite(body)

  const p = await prelude(req, { name: 'team', limit: 40, body })
  if (p.res) return p.res
  try {
    switch (body.action) {
      case 'invite': return await invite(p)
      case 'revoke_invite': return await revokeInvite(p)
      case 'set_role': return await setRole(p)
      case 'set_extra': return await setExtra(p)
      case 'set_status': return await setStatus(p)
      case 'remove': return await removeMember(p)
      case 'role_save': return await roleSave(p)
      case 'role_delete': return await roleDelete(p)
      default: return json(400, { error: 'Unknown action' })
    }
  } catch (err) {
    console.error('Team route failed:', err)
    return json(500, { error: 'Something went wrong' })
  }
}

async function getRole(admin, key) {
  const { data } = await admin.from('staff_roles').select('*').eq('key', key).maybeSingle()
  return data
}

// May the caller change this person? Never the Owner, never themselves, and
// never someone holding more power than the caller.
async function loadTarget({ ctx, admin }, userId) {
  if (!UUID.test(userId)) return { error: json(400, { error: 'Bad request' }) }
  if (userId === ctx.user.id) return { error: json(400, { error: 'You can’t change your own access' }) }
  const { data: member } = await admin.from('staff_members').select('*').eq('user_id', userId).maybeSingle()
  if (!member) return { error: json(404, { error: 'That person is not on the team' }) }
  if (member.role_key === 'owner') return { error: json(400, { error: 'The Owner can’t be changed' }) }
  const role = await getRole(admin, member.role_key)
  if (!covers(ctx.permissions, effective(role, member.extra_permissions))) {
    return { error: json(403, { error: 'This person has more access than you, so you can’t change them' }) }
  }
  return { member, role }
}

async function invite(a) {
  const { ctx, admin, body, ip } = a
  if (!can(ctx, 'staff.manage')) return json(403, { error: 'You don’t have permission to invite staff' })
  const email = String(body.email || '').trim().toLowerCase()
  if (!EMAIL.test(email) || email.length > 200) return json(400, { error: 'Enter a valid email address' })
  const role = await getRole(admin, String(body.role_key || ''))
  if (!role || role.key === 'owner') return json(400, { error: 'Choose a role' })
  if (!covers(ctx.permissions, role.permissions)) return json(403, { error: 'You can only invite people to roles with no more access than you have' })

  const token = crypto.randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + 72 * 3600 * 1000).toISOString()
  const e = { action: 'staff.invite', targetType: 'invite', targetId: email }
  const bad = await auditFirst(ctx, ip, { ...e, after: { role: role.key, expires } })
  if (bad) return bad
  await admin.from('staff_invites').update({ revoked_at: new Date().toISOString() }).eq('email', email).is('accepted_at', null).is('revoked_at', null)
  const { error } = await admin.from('staff_invites').insert({ email, role_key: role.key, token_hash: sha256(token), invited_by: ctx.user.id, expires_at: expires })
  if (error) {
    await auditFailed(ctx, ip, e, error.message)
    return json(500, { error: error.message })
  }
  const h = headers()
  const host = h.get('x-forwarded-host') || h.get('host')
  const link = (h.get('x-forwarded-proto') || 'https') + '://' + host + '/invite/' + token
  const mail = await sendEmail({
    to: email,
    subject: 'You are invited to the Flitters admin team',
    html: '<p>You were invited to join the Flitters admin team as <strong>' + esc(role.name) + '</strong>.</p><p><a href="' + esc(link) + '">Accept the invite</a></p><p>The link works once and expires in 72 hours. Sign in with this email address.</p>',
  })
  return json(200, { ok: true, link, expires, emailed: mail.sent, emailNote: mail.reason || null })
}

async function revokeInvite({ ctx, admin, body, ip }) {
  if (!can(ctx, 'staff.manage')) return json(403, { error: 'You don’t have permission to manage staff' })
  const id = String(body.inviteId || '')
  if (!UUID.test(id)) return json(400, { error: 'Bad request' })
  const e = { action: 'staff.invite_revoked', targetType: 'invite', targetId: id }
  const bad = await auditFirst(ctx, ip, e)
  if (bad) return bad
  const { error } = await admin.from('staff_invites').update({ revoked_at: new Date().toISOString() }).eq('id', id).is('accepted_at', null)
  if (error) return json(500, { error: error.message })
  return json(200, { ok: true })
}

async function setRole(a) {
  const { ctx, admin, body, ip } = a
  if (!can(ctx, 'staff.manage')) return json(403, { error: 'You don’t have permission to manage staff' })
  const t = await loadTarget(a, String(body.userId || ''))
  if (t.error) return t.error
  const role = await getRole(admin, String(body.role_key || ''))
  if (!role || role.key === 'owner') return json(400, { error: 'Choose a role' })
  if (!covers(ctx.permissions, role.permissions)) return json(403, { error: 'You can only give roles with no more access than you have' })
  const e = { action: 'staff.set_role', targetType: 'staff', targetId: body.userId }
  const bad = await auditFirst(ctx, ip, { ...e, before: { role: t.member.role_key }, after: { role: role.key } })
  if (bad) return bad
  const { error } = await admin.from('staff_members').update({ role_key: role.key, updated_at: new Date().toISOString() }).eq('user_id', body.userId)
  if (error) {
    await auditFailed(ctx, ip, e, error.message)
    return json(500, { error: error.message })
  }
  return json(200, { ok: true })
}

async function setExtra(a) {
  const { ctx, admin, body, ip } = a
  if (!can(ctx, 'staff.manage')) return json(403, { error: 'You don’t have permission to manage staff' })
  const t = await loadTarget(a, String(body.userId || ''))
  if (t.error) return t.error
  const perms = Array.isArray(body.permissions) ? Array.from(new Set(body.permissions.map(String))) : null
  if (!perms || perms.some((x) => !PERMISSION_KEYS.includes(x))) return json(400, { error: 'Unknown permission' })
  if (!covers(ctx.permissions, perms)) return json(403, { error: 'You can only give access you have yourself' })
  const e = { action: 'staff.set_extra', targetType: 'staff', targetId: body.userId }
  const bad = await auditFirst(ctx, ip, { ...e, before: { extra: t.member.extra_permissions }, after: { extra: perms } })
  if (bad) return bad
  const { error } = await admin.from('staff_members').update({ extra_permissions: perms, updated_at: new Date().toISOString() }).eq('user_id', body.userId)
  if (error) {
    await auditFailed(ctx, ip, e, error.message)
    return json(500, { error: error.message })
  }
  return json(200, { ok: true })
}

async function setStatus(a) {
  const { ctx, admin, body, ip } = a
  if (!can(ctx, 'staff.manage')) return json(403, { error: 'You don’t have permission to manage staff' })
  if (!['active', 'suspended'].includes(body.status)) return json(400, { error: 'Bad request' })
  const t = await loadTarget(a, String(body.userId || ''))
  if (t.error) return t.error
  const e = { action: 'staff.set_status', targetType: 'staff', targetId: body.userId }
  const bad = await auditFirst(ctx, ip, { ...e, before: { status: t.member.status }, after: { status: body.status } })
  if (bad) return bad
  const { error } = await admin.from('staff_members').update({ status: body.status, updated_at: new Date().toISOString() }).eq('user_id', body.userId)
  if (error) {
    await auditFailed(ctx, ip, e, error.message)
    return json(500, { error: error.message })
  }
  return json(200, { ok: true })
}

async function removeMember(a) {
  const { ctx, admin, body, ip } = a
  if (!can(ctx, 'staff.manage')) return json(403, { error: 'You don’t have permission to manage staff' })
  const t = await loadTarget(a, String(body.userId || ''))
  if (t.error) return t.error
  const e = { action: 'staff.remove', targetType: 'staff', targetId: body.userId }
  const bad = await auditFirst(ctx, ip, { ...e, before: { role: t.member.role_key, extra: t.member.extra_permissions } })
  if (bad) return bad
  const { error } = await admin.from('staff_members').delete().eq('user_id', body.userId)
  if (error) {
    await auditFailed(ctx, ip, e, error.message)
    return json(500, { error: error.message })
  }
  return json(200, { ok: true })
}

async function roleSave({ ctx, admin, body, ip }) {
  if (!can(ctx, 'roles.manage')) return json(403, { error: 'You don’t have permission to manage roles' })
  const name = String(body.name || '').trim()
  const description = String(body.description || '').trim().slice(0, 120)
  const perms = Array.isArray(body.permissions) ? Array.from(new Set(body.permissions.map(String))) : null
  if (name.length < 2 || name.length > 40) return json(400, { error: 'Give the role a name (2 to 40 characters)' })
  if (!perms || perms.some((x) => !PERMISSION_KEYS.includes(x))) return json(400, { error: 'Unknown permission' })
  if (!covers(ctx.permissions, perms)) return json(403, { error: 'You can only give access you have yourself' })

  let key = body.key ? String(body.key) : null
  let before = null
  if (key) {
    before = await getRole(admin, key)
    if (!before) return json(404, { error: 'Role not found' })
    if (before.is_system) return json(400, { error: 'Built-in roles can’t be edited. Make a new role instead.' })
  } else {
    key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30)
    if (!key || RESERVED.includes(key)) return json(400, { error: 'Choose a different name' })
    if (await getRole(admin, key)) return json(400, { error: 'A role with that name already exists' })
  }
  const e = { action: 'role.save', targetType: 'role', targetId: key }
  const bad = await auditFirst(ctx, ip, { ...e, before: before ? { name: before.name, permissions: before.permissions } : null, after: { name, permissions: perms } })
  if (bad) return bad
  const row = { key, name, description, permissions: perms, is_system: false }
  const { error } = before
    ? await admin.from('staff_roles').update({ name, description, permissions: perms }).eq('key', key)
    : await admin.from('staff_roles').insert(row)
  if (error) {
    await auditFailed(ctx, ip, e, error.message)
    return json(500, { error: error.message })
  }
  return json(200, { ok: true, key })
}

async function roleDelete({ ctx, admin, body, ip }) {
  if (!can(ctx, 'roles.manage')) return json(403, { error: 'You don’t have permission to manage roles' })
  const key = String(body.key || '')
  const role = await getRole(admin, key)
  if (!role) return json(404, { error: 'Role not found' })
  if (role.is_system) return json(400, { error: 'Built-in roles can’t be deleted' })
  const m = await admin.from('staff_members').select('user_id', { count: 'exact', head: true }).eq('role_key', key)
  const i = await admin.from('staff_invites').select('id', { count: 'exact', head: true }).eq('role_key', key)
  if ((m.count || 0) > 0 || (i.count || 0) > 0) return json(400, { error: 'This role is still used by staff or invites. Move them to another role first.' })
  const e = { action: 'role.delete', targetType: 'role', targetId: key }
  const bad = await auditFirst(ctx, ip, { ...e, before: { name: role.name, permissions: role.permissions } })
  if (bad) return bad
  const { error } = await admin.from('staff_roles').delete().eq('key', key)
  if (error) {
    await auditFailed(ctx, ip, e, error.message)
    return json(500, { error: error.message })
  }
  return json(200, { ok: true })
}

async function acceptInvite(body) {
  const ip = clientIp(headers()) || 'unknown'
  if (rateLimited('accept:' + ip, 10, 60_000)) return json(429, { error: 'Too many tries. Wait a minute.' })
  const supabase = createClient()
  const { data: u } = await supabase.auth.getUser()
  const user = u && u.user
  if (!user) return json(401, { error: 'Sign in first' })
  const token = String(body.token || '')
  if (token.length < 20 || token.length > 100) return json(400, { error: 'This invite is not valid' })

  const admin = createAdminClient()
  const { data: inv } = await admin.from('staff_invites').select('*').eq('token_hash', sha256(token)).maybeSingle()
  if (!inv || inv.accepted_at || inv.revoked_at || new Date(inv.expires_at) < new Date()) return json(400, { error: 'This invite is no longer valid' })
  if ((user.email || '').toLowerCase() !== inv.email.toLowerCase()) return json(403, { error: 'This invite is for a different email address' })
  const role = await getRole(admin, inv.role_key)
  if (!role) return json(400, { error: 'The role in this invite no longer exists' })
  const { data: existing } = await admin.from('staff_members').select('user_id').eq('user_id', user.id).maybeSingle()
  if (existing) return json(400, { error: 'This account is already on the team' })

  try {
    await writeAudit({ actor: user, ip, action: 'staff.invite_accepted', targetType: 'staff', targetId: user.id, meta: { role: role.key, inviteId: inv.id } })
  } catch (err) {
    console.error(err)
    return json(500, { error: 'The audit log could not be written, so nothing was changed.' })
  }
  // Single use: only one request can flip accepted_at from empty.
  const claim = await admin.from('staff_invites').update({ accepted_at: new Date().toISOString(), accepted_by: user.id }).eq('id', inv.id).is('accepted_at', null).is('revoked_at', null).select('id')
  if (claim.error || !claim.data || claim.data.length === 0) return json(400, { error: 'This invite is no longer valid' })
  const { error } = await admin.from('staff_members').insert({ user_id: user.id, role_key: role.key, invited_by: inv.invited_by })
  if (error) {
    await admin.from('staff_invites').update({ accepted_at: null, accepted_by: null }).eq('id', inv.id)
    return json(500, { error: error.message })
  }
  return json(200, { ok: true })
}
