import 'server-only'
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { getStaffForApi } from '@/lib/staff'
import { writeAudit, clientIp } from '@/lib/audit'
import { rateLimited } from '@/lib/rateLimit'
import { createAdminClient } from '@/lib/supabase/admin'

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const json = (status, body) => NextResponse.json(body, { status })
export const snip = (s, n = 500) => (s == null ? null : String(s).slice(0, n))
export const isHttps = (u) => typeof u === 'string' && /^https:\/\/[^\s]+$/i.test(u)

// Common start of every staff route: sign-in + 2-step + staff + rate limit.
export async function prelude(req, { name, limit = 60, body = undefined }) {
  const ip = clientIp(headers())
  let data = body
  if (data === undefined) {
    try { data = await req.json() } catch { return { res: json(400, { error: 'Bad request' }) } }
  }
  let ctx
  try {
    ctx = await getStaffForApi(true)
  } catch (err) {
    console.error(err)
    return { res: json(500, { error: 'Server error' }) }
  }
  if (ctx.error === 'signed_out' || ctx.error === 'mfa_required') return { res: json(401, { error: 'Please sign in again' }) }
  if (ctx.error) return { res: json(403, { error: 'Not allowed' }) }
  if (rateLimited(name + ':' + ctx.user.id, limit, 60_000)) return { res: json(429, { error: 'Slow down a little and try again' }) }
  return { ctx, body: data, ip, admin: createAdminClient() }
}

// The audit entry is written BEFORE the change; if it fails, nothing changes.
export async function auditFirst(ctx, ip, entry) {
  try {
    await writeAudit({ actor: ctx.user, ip, ...entry })
    return null
  } catch (err) {
    console.error(err)
    return json(500, { error: 'The audit log could not be written, so nothing was changed.' })
  }
}

export async function auditFailed(ctx, ip, entry, message) {
  try {
    await writeAudit({ actor: ctx.user, ip, ...entry, action: entry.action + '.failed', meta: { ...(entry.meta || {}), error: snip(message, 300) } })
  } catch {}
}
