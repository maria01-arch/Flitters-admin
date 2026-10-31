import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

export function clientIp(headers) {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return headers.get('x-real-ip') || null
}

// Throws if the entry can't be saved, so destructive actions (added in later
// steps) can refuse to run when the audit trail is broken.
export async function writeAudit({ actor, action, targetType = null, targetId = null, before = null, after = null, ip = null, meta = null }) {
  const admin = createAdminClient()
  const { error } = await admin.from('audit_log').insert({
    actor_id: actor?.id || null,
    actor_email: actor?.email || null,
    action,
    target_type: targetType,
    target_id: targetId == null ? null : String(targetId),
    before,
    after,
    ip,
    meta,
  })
  if (error) throw new Error('Audit log write failed: ' + error.message)
}
