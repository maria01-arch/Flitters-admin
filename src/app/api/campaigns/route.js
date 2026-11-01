import { NextResponse } from 'next/server'
import { getAdvertiserContext } from '@/lib/advertiser'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimited } from '@/lib/rateLimit'
import { completeness } from '@/lib/campaignRules'
import { ownsKey, verifyImage, verifyVideo, publicUrlFor, ownedKeyFromUrl, deleteObject } from '@/lib/r2'

export const runtime = 'nodejs'

const json = (status, body) => NextResponse.json(body, { status })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10)

export async function POST(req) {
  const ctx = await getAdvertiserContext()
  if (ctx.error === 'signed_out') return json(401, { error: 'Please sign in again' })
  if (ctx.error) return json(403, { error: 'Not allowed' })
  if (rateLimited('camp:' + ctx.user.id, 60, 60_000)) return json(429, { error: 'Slow down a little and try again' })
  let body
  try { body = await req.json() } catch { return json(400, { error: 'Bad request' }) }
  const admin = createAdminClient()
  try {
    if (body.action === 'save') return await save(ctx, admin, body)
    if (body.action === 'cancel') return await cancel(ctx, admin, body)
    if (body.action === 'resubmit') return await resubmit(ctx, admin, body)
    return json(400, { error: 'Unknown action' })
  } catch (err) {
    console.error('Campaign route failed:', err)
    return json(500, { error: 'Something went wrong. Try again.' })
  }
}

// Every lookup is limited to the signed-in advertiser's own campaigns.
async function loadOwn(admin, adv, id) {
  if (!UUID.test(String(id || ''))) return null
  const { data } = await admin.from('ad_campaigns').select('*').eq('id', id).eq('advertiser_id', adv.id).maybeSingle()
  return data
}

async function save(ctx, admin, body) {
  const adv = ctx.advertiser
  let existing = null
  if (body.id) {
    existing = await loadOwn(admin, adv, body.id)
    if (!existing) return json(404, { error: 'Campaign not found' })
    if (!['draft', 'rejected'].includes(existing.status)) return json(400, { error: 'This campaign can’t be edited now' })
  }
  const locked = !!(existing && existing.paid_at) // price, dates and placement are fixed once paid
  const placement = locked ? existing.placement : body.placement
  if (!['feed', 'reel'].includes(placement)) return json(400, { error: 'Choose feed or Reels' })

  const name = String(body.name || '').trim().slice(0, 60)
  if (name.length < 2) return json(400, { error: 'Give your campaign a name' })
  const content = String(body.content || '').trim()
  if (content.length > 300) return json(400, { error: 'The text is too long (300 characters at most)' })
  const cta = String(body.cta_text || '').trim()
  if (cta.length > 24) return json(400, { error: 'The button text is too long (24 characters at most)' })
  const link = String(body.link_url || '').trim()
  if (link && (!/^https:\/\/[^\s]+$/i.test(link) || link.length > 500)) return json(400, { error: 'The link must start with https://' })

  const row = { name, placement, content: content || null, cta_text: cta || null, link_url: link || null }

  // Media: only files inside this advertiser's own folder, checked in storage.
  const same = existing && existing.placement === placement
  let image_url = same ? existing.image_url : null
  let video_url = same ? existing.video_url : null
  const oldFiles = []
  if (placement === 'feed') {
    if (existing && existing.video_url) oldFiles.push(existing.video_url)
    video_url = null
    if (body.image_key) {
      if (!ownsKey(adv.id, body.image_key)) return json(400, { error: 'That image is not valid' })
      const v = await verifyImage(body.image_key)
      if (!v.ok) return json(400, { error: v.error })
      if (image_url) oldFiles.push(image_url)
      image_url = publicUrlFor(body.image_key)
    }
  } else {
    if (existing && existing.image_url) oldFiles.push(existing.image_url)
    image_url = null
    if (body.video_key) {
      if (!ownsKey(adv.id, body.video_key)) return json(400, { error: 'That video is not valid' })
      const v = await verifyVideo(body.video_key)
      if (!v.ok) return json(400, { error: v.error })
      if (video_url) oldFiles.push(video_url)
      video_url = publicUrlFor(body.video_key)
    }
  }
  row.image_url = image_url
  row.video_url = video_url

  if (!locked) {
    const sd = body.start_date ? String(body.start_date) : null
    const d = body.days === '' || body.days == null ? null : Math.floor(Number(body.days))
    if (sd) {
      if (!DATE.test(sd) || Number.isNaN(Date.parse(sd))) return json(400, { error: 'That start date is not valid' })
      if (sd < isoDay(Date.now() + 86400000)) return json(400, { error: 'Pick a start date from tomorrow, so we have time to review' })
      if (sd > isoDay(Date.now() + 180 * 86400000)) return json(400, { error: 'Start dates can be up to 6 months ahead' })
    }
    if (d != null && !(d >= 1 && d <= 365)) return json(400, { error: 'Choose between 1 and 365 days' })
    row.start_at = sd ? sd + 'T00:00:00.000Z' : null
    row.days = d
    row.end_at = sd && d ? new Date(Date.parse(sd + 'T00:00:00.000Z') + d * 86400000).toISOString() : null
    // The price is worked out again when the person pays, so an old one never sticks.
    Object.assign(row, { country_code: null, currency: null, price_rule_id: null, price_per_day_minor: null, subtotal_minor: null, vat_percent: null, vat_minor: null, total_minor: null })
  }

  const res = existing
    ? await admin.from('ad_campaigns').update(row).eq('id', existing.id).eq('advertiser_id', adv.id).select('*').maybeSingle()
    : await admin.from('ad_campaigns').insert({ ...row, advertiser_id: adv.id, status: 'draft' }).select('*').maybeSingle()
  if (res.error || !res.data) {
    console.error('Save campaign failed:', res.error && res.error.message)
    return json(500, { error: 'Could not save. Try again.' })
  }
  // Replaced or dropped files are removed from storage (own folder only).
  for (const url of oldFiles) {
    const key = ownedKeyFromUrl(adv.id, url)
    if (key && url !== res.data.image_url && url !== res.data.video_url) await deleteObject(key)
  }
  const c = res.data
  return json(200, { ok: true, campaign: { id: c.id, status: c.status, image_url: c.image_url, video_url: c.video_url } })
}

async function cancel(ctx, admin, body) {
  const c = await loadOwn(admin, ctx.advertiser, body.id)
  if (!c) return json(404, { error: 'Campaign not found' })
  if (c.status !== 'draft') return json(400, { error: 'Only a draft can be deleted' })
  const { error } = await admin.from('ad_campaigns').update({ status: 'cancelled' }).eq('id', c.id).eq('advertiser_id', ctx.advertiser.id)
  if (error) return json(500, { error: 'Could not delete. Try again.' })
  return json(200, { ok: true })
}

// A rejected (already paid) campaign goes back to review after the fixes.
async function resubmit(ctx, admin, body) {
  const c = await loadOwn(admin, ctx.advertiser, body.id)
  if (!c) return json(404, { error: 'Campaign not found' })
  if (c.status !== 'rejected' || !c.paid_at) return json(400, { error: 'This campaign can’t be sent again' })
  const problem = completeness(c, { needFutureStart: false })
  if (problem) return json(400, { error: problem })
  if (new Date(c.end_at) <= new Date()) return json(400, { error: 'The dates for this campaign have passed. Please ask for a refund instead.' })
  const { error } = await admin.from('ad_campaigns').update({ status: 'pending_review' }).eq('id', c.id).eq('advertiser_id', ctx.advertiser.id).eq('status', 'rejected')
  if (error) return json(500, { error: 'Could not send it for review. Try again.' })
  return json(200, { ok: true })
}
