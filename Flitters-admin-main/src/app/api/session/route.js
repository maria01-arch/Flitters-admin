import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { getStaffForApi } from '@/lib/staff'
import { writeAudit, clientIp } from '@/lib/audit'
import { rateLimited } from '@/lib/rateLimit'

export const runtime = 'nodejs'

// Sign-in has two server checks:
//   stage "check"  - after the password: is this account active staff?
//                    (so ordinary app users are never offered 2-step setup)
//   stage "verify" - after 2-step: signed in at the 2-step level, staff,
//                    and the sign-in is written to the audit log.
export async function POST(req) {
  const h = headers()
  const ip = clientIp(h) || 'unknown'

  let body = {}
  try { body = await req.json() } catch {}
  const stage = body.stage === 'verify' ? 'verify' : body.stage === 'check' ? 'check' : null
  if (!stage) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  if (rateLimited('session:' + ip, 30, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  let ctx
  try {
    ctx = await getStaffForApi(stage === 'verify')
  } catch (err) {
    console.error('Session check failed:', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }

  if (ctx.error === 'signed_out' || ctx.error === 'mfa_required') {
    return NextResponse.json({ error: ctx.error }, { status: 401 })
  }
  if (ctx.error) return NextResponse.json({ error: 'not_authorised' }, { status: 403 })

  if (stage === 'verify') {
    try {
      await writeAudit({
        actor: ctx.user,
        action: 'auth.sign_in',
        ip,
        meta: { role: ctx.member.role_key, ua: (h.get('user-agent') || '').slice(0, 200) },
      })
    } catch (err) {
      console.error(err)
    }
  }
  return NextResponse.json({ ok: true })
}
