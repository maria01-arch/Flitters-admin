import { prelude, json, auditFirst, auditFailed, UUID, snip } from '@/lib/apiKit'
import { can } from '@/lib/staff'

export const runtime = 'nodejs'

const REASON_CODES = ['child_safety', 'nudity_sexual', 'violence', 'harassment', 'hate_speech', 'spam', 'impersonation', 'copyright', 'other']
const CONTENT_TYPES = ['post', 'comment', 'reel', 'reel_comment', 'message', 'profile', 'other']

// Strikes (account health) and help-center requests. Same pattern as the
// moderation route: sign-in + 2-step + permission + rate limit, and the audit
// entry is written BEFORE the change.
export async function POST(req) {
  const p = await prelude(req, { name: 'health', limit: 60 })
  if (p.res) return p.res
  const { ctx, body, ip, admin } = p
  try {
    switch (body.action) {
      case 'issue_strike': return await issueStrike({ ctx, body, ip, admin })
      case 'overturn_strike': return await overturnStrike({ ctx, body, ip, admin })
      case 'review_strike_appeal': return await reviewStrikeAppeal({ ctx, body, ip, admin })
      case 'reply_ticket': return await replyTicket({ ctx, body, ip, admin })
      case 'set_ticket_status': return await setTicketStatus({ ctx, body, ip, admin })
      case 'delete_ad_comment': return await deleteAdComment({ ctx, body, ip, admin })
      default: return json(400, { error: 'Unknown action' })
    }
  } catch (err) {
    console.error('Health route failed:', err)
    return json(500, { error: 'Something went wrong' })
  }
}

async function issueStrike({ ctx, body, ip, admin }) {
  if (!can(ctx, 'strikes.issue')) return json(403, { error: 'You don’t have permission to give strikes' })
  const userId = String(body.userId || '')
  const reasonCode = String(body.reasonCode || '')
  const reason = String(body.reason || '').trim()
  const severity = Number(body.severity)
  const days = body.expiresDays == null ? 90 : Number(body.expiresDays)
  const contentType = body.contentType ? String(body.contentType) : null
  const contentId = body.contentId ? String(body.contentId) : null
  const reportId = body.reportId ? String(body.reportId) : null
  if (!UUID.test(userId) || !REASON_CODES.includes(reasonCode)) return json(400, { error: 'Bad request' })
  if (reason.length < 3 || reason.length > 500) return json(400, { error: 'Write what the person is told, in 3 to 500 characters' })
  if (![1, 2, 3].includes(severity)) return json(400, { error: 'Points must be 1, 2 or 3' })
  if (!Number.isInteger(days) || days < 7 || days > 365) return json(400, { error: 'Expiry must be 7 to 365 days' })
  if (contentType && !CONTENT_TYPES.includes(contentType)) return json(400, { error: 'Bad request' })
  if ((contentId && !UUID.test(contentId)) || (reportId && !UUID.test(reportId))) return json(400, { error: 'Bad request' })
  if (userId === ctx.user.id) return json(400, { error: 'You can’t give a strike to your own account' })

  const { data: person } = await admin.from('profiles').select('id,username').eq('id', userId).maybeSingle()
  if (!person) return json(404, { error: 'This user no longer exists' })

  const row = {
    user_id: userId,
    reason_code: reasonCode,
    reason,
    severity,
    content_type: contentType,
    content_id: contentId,
    content_snapshot: body.snapshot ? snip(String(body.snapshot).trim(), 500) : null,
    report_id: reportId,
    issued_by: ctx.user.id,
    expires_at: new Date(Date.now() + days * 86400000).toISOString(),
  }
  const base = { action: 'strike.issue', targetType: 'user', targetId: userId }
  const bad = await auditFirst(ctx, ip, { ...base, after: { reason_code: reasonCode, severity, days, content_type: contentType, content_id: contentId }, meta: { reportId } })
  if (bad) return bad
  const { data, error } = await admin.from('account_strikes').insert(row).select('id,issued_at,expires_at').single()
  if (error) {
    await auditFailed(ctx, ip, base, error.message)
    return json(500, { error: /relation .* does not exist/.test(error.message) ? 'Strikes are not set up in the database yet (run 03_account_health_help.sql)' : error.message })
  }
  if (reportId) await admin.from('reports').update({ status: 'actioned', reviewed_at: new Date().toISOString() }).eq('id', reportId).eq('status', 'pending')
  return json(200, { ok: true, strike: { id: data.id, issued_at: data.issued_at, expires_at: data.expires_at, ...row, issued_by: undefined } })
}

async function overturnStrike({ ctx, body, ip, admin }) {
  if (!can(ctx, 'strikes.review')) return json(403, { error: 'You don’t have permission to remove strikes' })
  const id = String(body.strikeId || '')
  const note = String(body.note || '').trim()
  if (!UUID.test(id)) return json(400, { error: 'Bad request' })
  if (note.length > 500) return json(400, { error: 'Keep the note under 500 characters' })
  const { data: s } = await admin.from('account_strikes').select('id,user_id,status').eq('id', id).maybeSingle()
  if (!s) return json(404, { error: 'This strike no longer exists' })
  if (s.status === 'overturned') return json(409, { error: 'This strike was already removed' })
  const base = { action: 'strike.overturn', targetType: 'user', targetId: s.user_id }
  const bad = await auditFirst(ctx, ip, { ...base, before: { strike_id: id, status: s.status }, meta: { hasNote: !!note } })
  if (bad) return bad
  const now = new Date().toISOString()
  const { error } = await admin.from('account_strikes').update({ status: 'overturned', resolution_note: note || null, resolved_at: now }).eq('id', id)
  if (error) {
    await auditFailed(ctx, ip, base, error.message)
    return json(500, { error: error.message })
  }
  // A pending appeal on it is now moot.
  await admin.from('strike_appeals').update({ status: 'overturned', admin_note: note || null, reviewed_at: now, reviewed_by: ctx.user.id }).eq('strike_id', id).eq('status', 'pending')
  return json(200, { ok: true })
}

async function reviewStrikeAppeal({ ctx, body, ip, admin }) {
  if (!can(ctx, 'strikes.review')) return json(403, { error: 'You don’t have permission to review appeals' })
  const appealId = String(body.appealId || '')
  const decision = body.decision
  const note = String(body.note || '').trim()
  if (!UUID.test(appealId) || !['overturn', 'uphold'].includes(decision)) return json(400, { error: 'Bad request' })
  if (note.length > 500) return json(400, { error: 'Keep the feedback under 500 characters' })
  if (decision === 'uphold' && note.length < 3) return json(400, { error: 'Write the feedback the person will see (at least 3 characters)' })

  const { data: a } = await admin.from('strike_appeals').select('id,strike_id,user_id,status').eq('id', appealId).maybeSingle()
  if (!a) return json(404, { error: 'This appeal no longer exists' })
  if (a.status !== 'pending') return json(409, { error: 'This appeal was already reviewed' })

  const action = decision === 'overturn' ? 'strike.appeal_overturn' : 'strike.appeal_uphold'
  const base = { action, targetType: 'user', targetId: a.user_id }
  const bad = await auditFirst(ctx, ip, { ...base, before: { appeal_id: appealId, strike_id: a.strike_id }, meta: { hasNote: !!note } })
  if (bad) return bad

  const now = new Date().toISOString()
  // Claim the appeal first so two staff can't both decide it.
  const { data: claimed, error: e1 } = await admin
    .from('strike_appeals')
    .update({ status: decision === 'overturn' ? 'overturned' : 'upheld', admin_note: note || null, reviewed_at: now, reviewed_by: ctx.user.id })
    .eq('id', appealId).eq('status', 'pending').select('id')
  if (e1) {
    await auditFailed(ctx, ip, base, e1.message)
    return json(500, { error: e1.message })
  }
  if (!claimed || claimed.length === 0) return json(409, { error: 'Someone else just reviewed this appeal' })

  const { error: e2 } = await admin
    .from('account_strikes')
    .update(decision === 'overturn'
      ? { status: 'overturned', resolution_note: note || null, resolved_at: now }
      : { status: 'active', resolution_note: note, resolved_at: now })
    .eq('id', a.strike_id)
  if (e2) {
    await auditFailed(ctx, ip, base, e2.message)
    return json(500, { error: 'The appeal was recorded but the strike could not be updated: ' + e2.message })
  }
  return json(200, { ok: true, status: decision === 'overturn' ? 'overturned' : 'upheld' })
}

async function replyTicket({ ctx, body, ip, admin }) {
  if (!can(ctx, 'tickets.reply')) return json(403, { error: 'You don’t have permission to reply' })
  const ticketId = String(body.ticketId || '')
  const text = String(body.body || '').trim()
  if (!UUID.test(ticketId)) return json(400, { error: 'Bad request' })
  if (text.length < 1 || text.length > 2000) return json(400, { error: 'Reply must be 1 to 2000 characters' })
  const { data: t } = await admin.from('support_tickets').select('id,user_id').eq('id', ticketId).maybeSingle()
  if (!t) return json(404, { error: 'This request no longer exists' })
  const base = { action: 'ticket.reply', targetType: 'ticket', targetId: ticketId }
  const bad = await auditFirst(ctx, ip, { ...base, meta: { userId: t.user_id, length: text.length } })
  if (bad) return bad
  const { data, error } = await admin.from('support_messages').insert({ ticket_id: ticketId, sender_type: 'staff', sender_id: ctx.user.id, body: text }).select('id,created_at').single()
  if (error) {
    await auditFailed(ctx, ip, base, error.message)
    return json(500, { error: error.message })
  }
  return json(200, { ok: true, message: { id: data.id, from: 'staff', body: text, created_at: data.created_at } })
}

async function setTicketStatus({ ctx, body, ip, admin }) {
  if (!can(ctx, 'tickets.reply')) return json(403, { error: 'You don’t have permission to change requests' })
  const ticketId = String(body.ticketId || '')
  const status = body.status
  if (!UUID.test(ticketId) || !['open', 'resolved'].includes(status)) return json(400, { error: 'Bad request' })
  const { data: t } = await admin.from('support_tickets').select('id,status').eq('id', ticketId).maybeSingle()
  if (!t) return json(404, { error: 'This request no longer exists' })
  const base = { action: 'ticket.status', targetType: 'ticket', targetId: ticketId }
  const bad = await auditFirst(ctx, ip, { ...base, before: { status: t.status }, after: { status } })
  if (bad) return bad
  const { error } = await admin.from('support_tickets').update({ status, updated_at: new Date().toISOString() }).eq('id', ticketId)
  if (error) {
    await auditFailed(ctx, ip, base, error.message)
    return json(500, { error: error.message })
  }
  return json(200, { ok: true, status })
}

// Ad comments (Batch 4): staff with ad-review rights can remove a comment under an ad.
async function deleteAdComment({ ctx, body, ip, admin }) {
  if (!can(ctx, 'ads.review')) return json(403, { error: 'You don’t have permission to remove ad comments' })
  const id = String(body.commentId || '')
  if (!UUID.test(id)) return json(400, { error: 'Bad request' })
  const { data: c } = await admin.from('ad_comments').select('id,ad_id,user_id,content').eq('id', id).maybeSingle()
  if (!c) return json(404, { error: 'This comment no longer exists' })
  const base = { action: 'ad_comment.delete', targetType: 'user', targetId: c.user_id }
  const bad = await auditFirst(ctx, ip, { ...base, before: { comment_id: id, ad_id: c.ad_id, content: snip(c.content, 200) } })
  if (bad) return bad
  const { error } = await admin.from('ad_comments').delete().eq('id', id)
  if (error) {
    await auditFailed(ctx, ip, base, error.message)
    return json(500, { error: error.message })
  }
  return json(200, { ok: true })
}
