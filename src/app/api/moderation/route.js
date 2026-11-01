import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { getStaffForApi, can } from '@/lib/staff'
import { writeAudit, clientIp } from '@/lib/audit'
import { rateLimited } from '@/lib/rateLimit'
import { createAdminClient } from '@/lib/supabase/admin'
import { cleanupMedia, urlsFromRows } from '@/lib/r2'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const json = (status, body) => NextResponse.json(body, { status })
const snip = (s, n = 500) => (s == null ? null : String(s).slice(0, n))

// The audit entry is written BEFORE the change. If it can't be saved, nothing
// is changed, so there is never a moderation action without a record.
async function auditFirst(ctx, ip, entry) {
  try {
    await writeAudit({ actor: ctx.user, ip, ...entry })
    return null
  } catch (err) {
    console.error(err)
    return json(500, { error: 'The audit log could not be written, so nothing was changed.' })
  }
}

async function auditFailed(ctx, ip, entry, message) {
  try {
    await writeAudit({ actor: ctx.user, ip, ...entry, action: entry.action + '.failed', meta: { ...(entry.meta || {}), error: snip(message, 300) } })
  } catch {}
}

export async function POST(req) {
  const ip = clientIp(headers())
  let body
  try { body = await req.json() } catch { return json(400, { error: 'Bad request' }) }

  let ctx
  try {
    ctx = await getStaffForApi(true)
  } catch (err) {
    console.error(err)
    return json(500, { error: 'Server error' })
  }
  if (ctx.error === 'signed_out' || ctx.error === 'mfa_required') return json(401, { error: 'Please sign in again' })
  if (ctx.error) return json(403, { error: 'Not allowed' })
  if (rateLimited('mod:' + ctx.user.id, 60, 60_000)) return json(429, { error: 'Slow down a little and try again' })

  const reportId = body.reportId ? String(body.reportId) : null
  if (reportId && !UUID.test(reportId)) return json(400, { error: 'Bad request' })

  const args = { ctx, admin: createAdminClient(), body, ip, reportId }
  try {
    if (body.action === 'delete_content') return await deleteContent(args)
    if (body.action === 'ban') return await ban(args)
    if (body.action === 'unban') return await unban(args)
    if (body.action === 'set_report_status') return await setReportStatus(args)
    if (body.action === 'set_badge') return await setBadge(args)
    if (body.action === 'view_message') return await viewMessage(args)
    if (body.action === 'review_appeal') return await reviewAppeal(args)
    return json(400, { error: 'Unknown action' })
  } catch (err) {
    console.error('Moderation failed:', err)
    return json(500, { error: 'Something went wrong' })
  }
}

// Removes the files of deleted rows from R2 (only the owner's own folders).
async function mediaStep(ctx, admin, ip, rows, ownerId, targetType, targetId) {
  const urls = urlsFromRows(rows)
  if (urls.length === 0) return { configured: true, deleted: 0, failed: 0, skipped: 0 }
  const res = await cleanupMedia(admin, urls, ['posts/' + ownerId + '/', 'reels/' + ownerId + '/'])
  if (res.configured) {
    try {
      await writeAudit({
        actor: ctx.user, ip, action: 'content.media_delete', targetType, targetId,
        meta: { deleted: res.deleted.slice(0, 20), failed: res.failed.slice(0, 20), skipped: res.skipped.length },
      })
    } catch {}
  }
  return { configured: res.configured, deleted: res.deleted.length, failed: res.failed.length, skipped: res.skipped.length }
}

async function deleteContent({ ctx, admin, body, ip, reportId }) {
  if (!can(ctx, 'content.delete')) return json(403, { error: 'You don’t have permission to delete content' })
  const type = body.type
  const id = String(body.id || '')
  if (!['post', 'comment', 'reel', 'reel_comment'].includes(type) || !UUID.test(id)) return json(400, { error: 'Bad request' })
  const now = new Date().toISOString()
  const base = { action: 'content.delete', targetType: type, targetId: id }

  if (type === 'post') {
    const { data: post } = await admin.from('posts').select('*').eq('id', id).maybeSingle()
    if (!post) return json(404, { error: 'This post no longer exists' })
    let siblings = []
    let reelCopies = []
    if (post.thread_id) {
      const r = await admin.from('posts').select('*').eq('thread_id', post.thread_id).eq('user_id', post.user_id)
      siblings = r.data || []
    }
    if (post.video_url) {
      const r = await admin.from('reels').select('*').eq('user_id', post.user_id).eq('video_url', post.video_url)
      reelCopies = r.data || []
    }
    const bad = await auditFirst(ctx, ip, { ...base, before: { user_id: post.user_id, content: snip(post.content), image_url: post.image_url, video_url: post.video_url, thread_id: post.thread_id }, meta: { reportId } })
    if (bad) return bad
    const { error } = await admin.from('posts').delete().eq('id', id)
    if (error) {
      await auditFailed(ctx, ip, base, error.message)
      return json(500, { error: error.message })
    }
    // Same side effects as the old admin: rest of the thread, Reels copy.
    if (post.thread_id) await admin.from('posts').delete().eq('thread_id', post.thread_id).eq('user_id', post.user_id)
    if (post.video_url) await admin.from('reels').delete().eq('user_id', post.user_id).eq('video_url', post.video_url)
    await admin.from('reports').update({ status: 'actioned', reviewed_at: now }).eq('reported_post_id', id)
    const media = await mediaStep(ctx, admin, ip, [post, ...siblings, ...reelCopies], post.user_id, 'post', id)
    return json(200, { ok: true, userId: post.user_id, media })
  }

  if (type === 'comment') {
    const { data: comment } = await admin.from('comments').select('*').eq('id', id).maybeSingle()
    if (!comment) return json(404, { error: 'This comment no longer exists' })
    const bad = await auditFirst(ctx, ip, { ...base, before: { user_id: comment.user_id, content: snip(comment.content) }, meta: { reportId } })
    if (bad) return bad
    await admin.from('comments').delete().eq('reply_to_comment_id', id)
    const { error } = await admin.from('comments').delete().eq('id', id)
    if (error) {
      await auditFailed(ctx, ip, base, error.message)
      return json(500, { error: error.message })
    }
    await admin.from('reports').update({ status: 'actioned', reviewed_at: now }).eq('reported_comment_id', id)
    const media = await mediaStep(ctx, admin, ip, [comment], comment.user_id, 'comment', id)
    return json(200, { ok: true, userId: comment.user_id, media })
  }

  if (type === 'reel_comment') {
    const { data: rc } = await admin.from('reel_comments').select('id,user_id,content').eq('id', id).maybeSingle()
    if (!rc) return json(404, { error: 'This comment no longer exists' })
    const bad = await auditFirst(ctx, ip, { ...base, before: { user_id: rc.user_id, content: snip(rc.content) }, meta: { reportId } })
    if (bad) return bad
    const { error } = await admin.from('reel_comments').delete().eq('id', id)
    if (error) {
      await auditFailed(ctx, ip, base, error.message)
      return json(500, { error: error.message })
    }
    await admin.from('reports').update({ status: 'actioned', reviewed_at: now }).eq('reported_reel_comment_id', id)
    return json(200, { ok: true, userId: rc.user_id, media: { configured: true, deleted: 0, failed: 0, skipped: 0 } })
  }

  const { data: reel } = await admin.from('reels').select('*').eq('id', id).maybeSingle()
  if (!reel) return json(404, { error: 'This reel no longer exists' })
  let postCopies = []
  if (reel.video_url) {
    const r = await admin.from('posts').select('*').eq('user_id', reel.user_id).eq('video_url', reel.video_url)
    postCopies = r.data || []
  }
  const bad = await auditFirst(ctx, ip, { ...base, before: { user_id: reel.user_id, caption: snip(reel.caption), video_url: reel.video_url }, meta: { reportId } })
  if (bad) return bad
  await admin.from('reel_likes').delete().eq('reel_id', id)
  const { error } = await admin.from('reels').delete().eq('id', id)
  if (error) {
    await auditFailed(ctx, ip, base, error.message)
    return json(500, { error: error.message })
  }
  // A video post and its Reels copy share one video: remove the post copy too.
  if (reel.video_url) await admin.from('posts').delete().eq('user_id', reel.user_id).eq('video_url', reel.video_url)
  await admin.from('reports').update({ status: 'actioned', reviewed_at: now }).eq('reported_reel_id', id)
  const media = await mediaStep(ctx, admin, ip, [reel, ...postCopies], reel.user_id, 'reel', id)
  return json(200, { ok: true, userId: reel.user_id, media })
}

async function ban({ ctx, admin, body, ip, reportId }) {
  if (!can(ctx, 'users.ban')) return json(403, { error: 'You don’t have permission to ban users' })
  const userId = String(body.userId || '')
  if (!UUID.test(userId)) return json(400, { error: 'Bad request' })
  const hours = body.hours == null ? null : Number(body.hours)
  if (hours !== null && (!Number.isFinite(hours) || hours < 1 || hours > 24 * 365 * 10)) {
    return json(400, { error: 'Invalid ban length' })
  }
  if (hours === null && !can(ctx, 'users.ban.permanent')) {
    return json(403, { error: 'You can’t give permanent bans. Choose a length instead.' })
  }
  if (userId === ctx.user.id) return json(400, { error: 'You can’t ban yourself' })
  // The person sees this on their ban screen, so it is required.
  const reasonText = String(body.reason || '').trim()
  if (reasonText.length < 5) return json(400, { error: 'Write a reason (at least 5 characters). The person will see it on their ban screen.' })
  if (reasonText.length > 300) return json(400, { error: 'The reason is too long (300 characters at most)' })

  const { data: staffRow } = await admin.from('staff_members').select('user_id').eq('user_id', userId).maybeSingle()
  if (staffRow) return json(400, { error: 'Staff accounts can’t be banned from here. Remove their staff role first.' })

  const { data: prof } = await admin.from('profiles').select('username').eq('id', userId).maybeSingle()
  const rounded = hours === null ? null : Math.round(hours)
  const entry = { action: 'user.ban', targetType: 'user', targetId: userId }
  const bad = await auditFirst(ctx, ip, {
    ...entry,
    after: { length: rounded === null ? 'permanent' : rounded + 'h' },
    meta: { username: prof?.username || null, reason: reasonText, reportId },
  })
  if (bad) return bad

  const { data, error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: rounded === null ? '876000h' : rounded + 'h',
  })
  if (error) {
    await auditFailed(ctx, ip, entry, error.message)
    return json(500, { error: error.message })
  }
  // What the app's ban screen reads: the reason, and when this ban began (a new
  // ban lets the person appeal again).
  const pu = await admin.from('profiles').update({ ban_reason: reasonText, banned_at: new Date().toISOString() }).eq('id', userId)
  if (reportId) await admin.from('reports').update({ status: 'actioned', reviewed_at: new Date().toISOString() }).eq('id', reportId)
  return json(200, { ok: true, bannedUntil: (data && data.user && data.user.banned_until) || null, profileNote: pu.error ? pu.error.message : null })
}

async function unban({ ctx, admin, body, ip, reportId }) {
  if (!can(ctx, 'users.unban')) return json(403, { error: 'You don’t have permission to unban users' })
  const userId = String(body.userId || '')
  if (!UUID.test(userId)) return json(400, { error: 'Bad request' })
  const { data: prof } = await admin.from('profiles').select('username').eq('id', userId).maybeSingle()
  const entry = { action: 'user.unban', targetType: 'user', targetId: userId }
  const bad = await auditFirst(ctx, ip, { ...entry, meta: { username: prof?.username || null, reportId } })
  if (bad) return bad
  const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' })
  if (error) {
    await auditFailed(ctx, ip, entry, error.message)
    return json(500, { error: error.message })
  }
  await admin.from('profiles').update({ ban_reason: null }).eq('id', userId)
  return json(200, { ok: true })
}

async function setReportStatus({ ctx, admin, body, ip }) {
  if (!can(ctx, 'reports.resolve')) return json(403, { error: 'You don’t have permission to resolve reports' })
  const id = String(body.reportId || '')
  const status = body.status
  if (!UUID.test(id) || !['actioned', 'dismissed'].includes(status)) return json(400, { error: 'Bad request' })
  const { data: report } = await admin.from('reports').select('id,status').eq('id', id).maybeSingle()
  if (!report) return json(404, { error: 'This report no longer exists' })
  const entry = { action: 'report.status', targetType: 'report', targetId: id }
  const bad = await auditFirst(ctx, ip, { ...entry, before: { status: report.status }, after: { status } })
  if (bad) return bad
  const { error } = await admin.from('reports').update({ status, reviewed_at: new Date().toISOString() }).eq('id', id)
  if (error) {
    await auditFailed(ctx, ip, entry, error.message)
    return json(500, { error: error.message })
  }
  return json(200, { ok: true, status })
}

async function setBadge({ ctx, admin, body, ip }) {
  if (!can(ctx, 'badges.grant')) return json(403, { error: 'You don’t have permission to change badges' })
  const userId = String(body.userId || '')
  const badge = body.badge
  const value = body.value === true
  if (!UUID.test(userId) || !['authentic', 'verified'].includes(badge) || typeof body.value !== 'boolean') {
    return json(400, { error: 'Bad request' })
  }
  const { data: prof } = await admin.from('profiles').select('id,username,verified,is_authentic,verified_plan').eq('id', userId).maybeSingle()
  if (!prof) return json(404, { error: 'User not found' })
  // The blue badge also comes from paid plans. Those follow the subscription,
  // so a hand-given change must never touch them.
  if (badge === 'authentic' && prof.verified_plan) {
    return json(400, { error: 'This blue badge comes from a paid plan. It follows the subscription, so it can’t be changed here.' })
  }
  const col = badge === 'authentic' ? 'is_authentic' : 'verified'
  if (!!prof[col] === value) return json(200, { ok: true, value, unchanged: true })
  const entry = { action: value ? 'badge.grant' : 'badge.remove', targetType: 'user', targetId: userId }
  const bad = await auditFirst(ctx, ip, { ...entry, before: { [col]: !!prof[col] }, after: { [col]: value }, meta: { badge, username: prof.username || null } })
  if (bad) return bad
  const { error } = await admin.from('profiles').update({ [col]: value }).eq('id', userId)
  if (error) {
    await auditFailed(ctx, ip, entry, error.message)
    return json(500, { error: error.message })
  }
  return json(200, { ok: true, value })
}

// Shows ONE reported message and nothing else from the chat. Each view is
// recorded in the audit log before anything is returned.
async function viewMessage({ ctx, admin, body, ip }) {
  if (!can(ctx, 'messages.view_reported')) return json(403, { error: 'You don’t have permission to view reported messages' })
  if (rateLimited('msgview:' + ctx.user.id, 20, 60_000)) return json(429, { error: 'Slow down a little and try again' })
  const reportId = String(body.reportId || '')
  if (!UUID.test(reportId)) return json(400, { error: 'Bad request' })
  const { data: report } = await admin.from('reports').select('id,reported_message_id').eq('id', reportId).maybeSingle()
  if (!report || !report.reported_message_id) return json(404, { error: 'This report has no message' })

  let source = 'direct'
  let { data: msg } = await admin.from('messages').select('*').eq('id', report.reported_message_id).maybeSingle()
  if (!msg) {
    source = 'group'
    const r = await admin.from('group_messages').select('*').eq('id', report.reported_message_id).maybeSingle()
    msg = r.data
  }
  if (!msg) return json(404, { error: 'This message no longer exists' })

  const bad = await auditFirst(ctx, ip, {
    action: 'message.view_reported',
    targetType: 'message',
    targetId: report.reported_message_id,
    meta: { reportId, source },
  })
  if (bad) return bad

  const { data: sender } = await admin.from('profiles').select('username,display_name').eq('id', msg.sender_id).maybeSingle()
  return json(200, {
    ok: true,
    message: {
      source,
      sender_id: msg.sender_id,
      sender: sender || null,
      content: msg.content == null ? null : String(msg.content).slice(0, 4000),
      created_at: msg.created_at,
      media: urlsFromRows([msg]),
    },
  })
}

// Accept (lifts the ban) or reject (the note is shown to the person in the app).
async function reviewAppeal({ ctx, admin, body, ip }) {
  if (!can(ctx, 'appeals.review')) return json(403, { error: 'You don’t have permission to review appeals' })
  const id = String(body.appealId || '')
  const decision = body.decision
  if (!UUID.test(id) || !['approve', 'reject'].includes(decision)) return json(400, { error: 'Bad request' })
  const note = String(body.note || '').trim()
  if (decision === 'reject' && note.length < 5) return json(400, { error: 'Write a reason (at least 5 characters). The person will see it.' })
  if (note.length > 500) return json(400, { error: 'The note is too long (500 characters at most)' })

  const { data: ap } = await admin.from('ban_appeals').select('*').eq('id', id).maybeSingle()
  if (!ap) return json(404, { error: 'Appeal not found' })
  if (ap.status !== 'pending') return json(400, { error: 'This appeal was already decided' })
  const { data: prof } = await admin.from('profiles').select('username').eq('id', ap.user_id).maybeSingle()
  const status = decision === 'approve' ? 'approved' : 'rejected'
  const entry = { action: decision === 'approve' ? 'appeal.approve' : 'appeal.reject', targetType: 'appeal', targetId: id }
  const bad = await auditFirst(ctx, ip, {
    ...entry,
    before: { status: 'pending' },
    after: { status },
    meta: { userId: ap.user_id, username: prof?.username || null, note: snip(note, 500) },
  })
  if (bad) return bad

  if (decision === 'approve') {
    const { error } = await admin.auth.admin.updateUserById(ap.user_id, { ban_duration: 'none' })
    if (error) {
      await auditFailed(ctx, ip, entry, error.message)
      return json(500, { error: 'Could not lift the ban: ' + error.message })
    }
    await admin.from('profiles').update({ ban_reason: null }).eq('id', ap.user_id)
  }
  const upd = await admin
    .from('ban_appeals')
    .update({ status, admin_note: note || null, reviewed_at: new Date().toISOString(), reviewed_by: ctx.user.id })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')
  if (upd.error || !upd.data || upd.data.length === 0) {
    await auditFailed(ctx, ip, entry, upd.error ? upd.error.message : 'appeal already decided')
    return json(500, { error: decision === 'approve' ? 'The ban was lifted, but the appeal could not be marked as accepted. Reload and check.' : 'The appeal could not be updated. Reload and check.' })
  }
  return json(200, { ok: true, status })
}
