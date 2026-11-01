import { can } from '@/lib/staff'
import { prelude, json, UUID, snip, isHttps, auditFirst, auditFailed } from '@/lib/apiKit'
import { sendEmail, esc } from '@/lib/email'
import { resolveQuote } from '@/lib/pricing'
import { countryName } from '@/lib/countries'
import { utc } from '@/lib/format'

export const runtime = 'nodejs'

export async function POST(req) {
  const p = await prelude(req, { name: 'ads', limit: 60 })
  if (p.res) return p.res
  const a = p
  try {
    switch (a.body.action) {
      case 'campaign_review': return await campaignReview(a)
      case 'campaign_set_state': return await campaignSetState(a)
      case 'house_save': return await houseSave(a)
      case 'house_toggle': return await houseToggle(a)
      case 'house_delete': return await houseDelete(a)
      case 'price_save': return await priceSave(a)
      case 'price_set_active': return await priceSetActive(a)
      case 'currency_set': return await currencySet(a)
      case 'country_save': return await countrySave(a)
      case 'country_delete': return await countryDelete(a)
      case 'quote': return await quote(a)
      default: return json(400, { error: 'Unknown action' })
    }
  } catch (err) {
    console.error('Ads route failed:', err)
    return json(500, { error: 'Something went wrong' })
  }
}

const toMinor = (v) => {
  const n = Number(String(v == null ? '' : v).replace(/,/g, ''))
  if (!Number.isFinite(n) || n <= 0 || n > 1e8) return null
  return Math.round(n * 100)
}

async function campaignReview({ ctx, admin, body, ip }) {
  if (!can(ctx, 'ads.review')) return json(403, { error: 'You don’t have permission to review ads' })
  const id = String(body.campaignId || '')
  const decision = body.decision
  if (!UUID.test(id) || !['approve', 'reject'].includes(decision)) return json(400, { error: 'Bad request' })
  const { data: c } = await admin.from('ad_campaigns').select('*').eq('id', id).maybeSingle()
  if (!c) return json(404, { error: 'Campaign not found' })
  if (c.status !== 'pending_review') return json(400, { error: 'This campaign is not waiting for review (it is ' + c.status + ')' })
  const { data: adv } = await admin.from('advertisers').select('business_name,contact_email').eq('id', c.advertiser_id).maybeSingle()
  const now = new Date()
  const entry = { targetType: 'campaign', targetId: id }

  if (decision === 'reject') {
    const reason = String(body.reason || '').trim()
    if (reason.length < 5) return json(400, { error: 'Give the advertiser a reason (at least 5 characters)' })
    if (reason.length > 500) return json(400, { error: 'The reason is too long (500 characters at most)' })
    const e = { ...entry, action: 'ad.reject' }
    const bad = await auditFirst(ctx, ip, { ...e, before: { status: c.status }, after: { status: 'rejected' }, meta: { reason, advertiser: adv && adv.business_name } })
    if (bad) return bad
    const { error } = await admin.from('ad_campaigns').update({ status: 'rejected', reviewed_by: ctx.user.id, reviewed_at: now.toISOString(), rejection_reason: reason }).eq('id', id)
    if (error) {
      await auditFailed(ctx, ip, e, error.message)
      return json(500, { error: error.message })
    }
    const mail = adv ? await sendEmail({
      to: adv.contact_email,
      subject: 'Your Flitters ad needs changes',
      html: '<p>Your ad “' + esc(c.name) + '” was not approved.</p><p><strong>Reason:</strong> ' + esc(reason) + '</p><p>You can edit it and send it again within 7 days. After that you can ask for a refund.</p>',
    }) : { sent: false, reason: 'No advertiser email' }
    return json(200, { ok: true, status: 'rejected', emailed: mail.sent, emailNote: mail.reason || null })
  }

  // Approve: the checks the database can't make for us.
  if (!isHttps(c.link_url)) return json(400, { error: 'The link must start with https://' })
  if (c.placement === 'feed' && !c.image_url) return json(400, { error: 'A feed ad needs an image' })
  if (c.placement === 'reel' && !c.video_url) return json(400, { error: 'A reel ad needs a video' })
  if (!c.start_at || !c.end_at || new Date(c.end_at) <= now) return json(400, { error: 'The dates have already passed. Reject it so the advertiser can fix them.' })

  const e = { ...entry, action: 'ad.approve' }
  const bad = await auditFirst(ctx, ip, { ...e, before: { status: c.status }, after: { status: 'approved' }, meta: { advertiser: adv && adv.business_name } })
  if (bad) return bad
  const { error } = await admin.from('ad_campaigns').update({ status: 'approved', reviewed_by: ctx.user.id, reviewed_at: now.toISOString(), rejection_reason: null }).eq('id', id)
  if (error) {
    await auditFailed(ctx, ip, e, error.message)
    return json(500, { error: error.message })
  }
  let status = 'approved'
  if (new Date(c.start_at) <= now) {
    const r = await admin.from('ad_campaigns').update({ status: 'live' }).eq('id', id).eq('status', 'approved')
    if (!r.error) status = 'live'
  }
  const mail = adv ? await sendEmail({
    to: adv.contact_email,
    subject: 'Your Flitters ad was approved',
    html: '<p>Your ad “' + esc(c.name) + '” was approved.</p><p>' + (status === 'live' ? 'It is live now.' : 'It goes live on ' + esc(utc(c.start_at)) + '.') + '</p>',
  }) : { sent: false, reason: 'No advertiser email' }
  return json(200, { ok: true, status, emailed: mail.sent, emailNote: mail.reason || null })
}

async function campaignSetState({ ctx, admin, body, ip }) {
  if (!can(ctx, 'ads.edit')) return json(403, { error: 'You don’t have permission to edit ads' })
  const id = String(body.campaignId || '')
  const to = body.to
  if (!UUID.test(id) || !['paused', 'live'].includes(to)) return json(400, { error: 'Bad request' })
  const { data: c } = await admin.from('ad_campaigns').select('id,status,end_at').eq('id', id).maybeSingle()
  if (!c) return json(404, { error: 'Campaign not found' })
  if (to === 'paused' && c.status !== 'live') return json(400, { error: 'Only a live ad can be paused' })
  if (to === 'live' && (c.status !== 'paused' || new Date(c.end_at) <= new Date())) return json(400, { error: 'Only a paused ad that has not ended can be resumed' })
  const e = { action: to === 'paused' ? 'ad.pause' : 'ad.resume', targetType: 'campaign', targetId: id }
  const bad = await auditFirst(ctx, ip, { ...e, before: { status: c.status }, after: { status: to } })
  if (bad) return bad
  const { error } = await admin.from('ad_campaigns').update({ status: to }).eq('id', id)
  if (error) {
    await auditFailed(ctx, ip, e, error.message)
    return json(500, { error: error.message })
  }
  return json(200, { ok: true, status: to })
}

function cleanHouse(body) {
  const f = body.fields || {}
  const out = {
    type: f.type === 'reel' ? 'reel' : 'post',
    advertiser_name: String(f.advertiser_name || '').trim(),
    content: String(f.content || '').trim(),
    link_url: String(f.link_url || '').trim(),
    cta_text: String(f.cta_text || '').trim(),
    image_url: String(f.image_url || '').trim(),
    video_url: String(f.video_url || '').trim(),
    advertiser_avatar_url: String(f.advertiser_avatar_url || '').trim(),
  }
  if (out.advertiser_name.length < 1 || out.advertiser_name.length > 80) return { error: 'Advertiser name is required (80 characters at most)' }
  if (out.content.length > 500) return { error: 'The text is too long (500 characters at most)' }
  if (out.cta_text.length > 24) return { error: 'The button text is too long (24 characters at most)' }
  for (const k of ['link_url', 'image_url', 'video_url', 'advertiser_avatar_url']) {
    if (out[k] && !isHttps(out[k])) return { error: k.replace(/_/g, ' ') + ' must start with https://' }
  }
  if (out.type === 'post' && !out.image_url) return { error: 'A feed ad needs an image' }
  if (out.type === 'reel' && !out.video_url) return { error: 'A reel ad needs a video' }
  for (const k of Object.keys(out)) if (out[k] === '') out[k] = null
  if (out.type === 'post') out.video_url = null
  return { fields: out }
}

async function houseSave({ ctx, admin, body, ip }) {
  if (!can(ctx, 'ads.edit')) return json(403, { error: 'You don’t have permission to edit ads' })
  const cl = cleanHouse(body)
  if (cl.error) return json(400, { error: cl.error })
  const id = body.id ? String(body.id) : null
  if (id && !UUID.test(id)) return json(400, { error: 'Bad request' })
  let before = null
  if (id) {
    const { data: existing } = await admin.from('ads').select('*').eq('id', id).maybeSingle()
    if (!existing) return json(404, { error: 'Ad not found' })
    if (existing.campaign_id) return json(400, { error: 'This ad belongs to an advertiser campaign. Change it from the campaign.' })
    before = existing
  }
  const e = { action: 'ad.house_save', targetType: 'ad', targetId: id || 'new' }
  const bad = await auditFirst(ctx, ip, { ...e, before: before ? { advertiser_name: before.advertiser_name, content: snip(before.content, 200), link_url: before.link_url, type: before.type, active: before.active } : null, after: cl.fields })
  if (bad) return bad
  const res = id
    ? await admin.from('ads').update(cl.fields).eq('id', id).select('*').maybeSingle()
    : await admin.from('ads').insert({ ...cl.fields, active: false }).select('*').maybeSingle()
  if (res.error) {
    await auditFailed(ctx, ip, e, res.error.message)
    return json(500, { error: res.error.message })
  }
  return json(200, { ok: true, ad: res.data })
}

async function houseToggle({ ctx, admin, body, ip }) {
  if (!can(ctx, 'ads.edit')) return json(403, { error: 'You don’t have permission to edit ads' })
  const id = String(body.id || '')
  if (!UUID.test(id) || typeof body.active !== 'boolean') return json(400, { error: 'Bad request' })
  const { data: ad } = await admin.from('ads').select('id,active,campaign_id').eq('id', id).maybeSingle()
  if (!ad) return json(404, { error: 'Ad not found' })
  if (ad.campaign_id) return json(400, { error: 'This ad belongs to an advertiser campaign. Pause it from the campaign.' })
  const e = { action: 'ad.house_toggle', targetType: 'ad', targetId: id }
  const bad = await auditFirst(ctx, ip, { ...e, before: { active: ad.active }, after: { active: body.active } })
  if (bad) return bad
  const { error } = await admin.from('ads').update({ active: body.active }).eq('id', id)
  if (error) {
    await auditFailed(ctx, ip, e, error.message)
    return json(500, { error: error.message })
  }
  return json(200, { ok: true, active: body.active })
}

async function houseDelete({ ctx, admin, body, ip }) {
  if (!can(ctx, 'ads.edit')) return json(403, { error: 'You don’t have permission to edit ads' })
  const id = String(body.id || '')
  if (!UUID.test(id)) return json(400, { error: 'Bad request' })
  const { data: ad } = await admin.from('ads').select('*').eq('id', id).maybeSingle()
  if (!ad) return json(404, { error: 'Ad not found' })
  if (ad.campaign_id) return json(400, { error: 'This ad belongs to an advertiser campaign and can’t be deleted here.' })
  const e = { action: 'ad.house_delete', targetType: 'ad', targetId: id }
  const bad = await auditFirst(ctx, ip, { ...e, before: { advertiser_name: ad.advertiser_name, content: snip(ad.content, 200), link_url: ad.link_url, type: ad.type } })
  if (bad) return bad
  const { error } = await admin.from('ads').delete().eq('id', id)
  if (error) {
    await auditFailed(ctx, ip, e, error.message)
    return json(500, { error: error.message })
  }
  return json(200, { ok: true })
}

async function priceSave({ ctx, admin, body, ip }) {
  if (!can(ctx, 'pricing.manage')) return json(403, { error: 'You don’t have permission to set prices' })
  const country = body.country_code ? String(body.country_code).toUpperCase() : null
  if (country && !/^[A-Z]{2}$/.test(country)) return json(400, { error: 'Bad country' })
  const placement = body.placement
  const currency = String(body.currency || '').toUpperCase()
  const minor = toMinor(body.price)
  const minDays = Math.floor(Number(body.min_days))
  const maxDays = Math.floor(Number(body.max_days))
  if (!['feed', 'reel'].includes(placement)) return json(400, { error: 'Choose feed or reel' })
  if (!minor) return json(400, { error: 'Enter a price above zero' })
  if (!(minDays >= 1 && minDays <= 365 && maxDays >= minDays && maxDays <= 365)) return json(400, { error: 'Days must be between 1 and 365, and the maximum can’t be below the minimum' })
  const { data: cur } = await admin.from('payment_currencies').select('currency').eq('currency', currency).maybeSingle()
  if (!cur) return json(400, { error: 'That currency is not in the currency list yet' })
  const id = body.id ? String(body.id) : null
  if (id && !UUID.test(id)) return json(400, { error: 'Bad request' })
  const fields = { country_code: country, placement, currency, price_per_day_minor: minor, min_days: minDays, max_days: maxDays, active: body.active !== false, note: snip(body.note, 200), updated_by: ctx.user.id, updated_at: new Date().toISOString() }
  let before = null
  if (id) {
    const { data } = await admin.from('ad_price_rules').select('*').eq('id', id).maybeSingle()
    if (!data) return json(404, { error: 'Price not found' })
    before = data
  }
  const e = { action: 'price.save', targetType: 'price_rule', targetId: id || 'new' }
  const bad = await auditFirst(ctx, ip, { ...e, before, after: fields })
  if (bad) return bad
  const res = id
    ? await admin.from('ad_price_rules').update(fields).eq('id', id).select('*').maybeSingle()
    : await admin.from('ad_price_rules').insert({ ...fields, created_by: ctx.user.id }).select('*').maybeSingle()
  if (res.error) {
    await auditFailed(ctx, ip, e, res.error.message)
    const dup = res.error.code === '23505'
    return json(dup ? 400 : 500, { error: dup ? 'There is already an active price for that region, placement and currency. Edit that one or switch it off first.' : res.error.message })
  }
  return json(200, { ok: true, rule: res.data })
}

async function priceSetActive({ ctx, admin, body, ip }) {
  if (!can(ctx, 'pricing.manage')) return json(403, { error: 'You don’t have permission to set prices' })
  const id = String(body.id || '')
  if (!UUID.test(id) || typeof body.active !== 'boolean') return json(400, { error: 'Bad request' })
  const { data: rule } = await admin.from('ad_price_rules').select('id,active').eq('id', id).maybeSingle()
  if (!rule) return json(404, { error: 'Price not found' })
  const e = { action: 'price.set_active', targetType: 'price_rule', targetId: id }
  const bad = await auditFirst(ctx, ip, { ...e, before: { active: rule.active }, after: { active: body.active } })
  if (bad) return bad
  const { error } = await admin.from('ad_price_rules').update({ active: body.active, updated_by: ctx.user.id, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) {
    await auditFailed(ctx, ip, e, error.message)
    const dup = error.code === '23505'
    return json(dup ? 400 : 500, { error: dup ? 'Another active price already covers that region, placement and currency.' : error.message })
  }
  return json(200, { ok: true, active: body.active })
}

async function currencySet({ ctx, admin, body, ip }) {
  if (!can(ctx, 'pricing.manage')) return json(403, { error: 'You don’t have permission to set prices' })
  const currency = String(body.currency || '').toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency) || typeof body.enabled !== 'boolean') return json(400, { error: 'Bad request' })
  if (currency === 'USD' && !body.enabled) return json(400, { error: 'USD must stay on. It is the fallback for every other currency.' })
  const e = { action: 'currency.set', targetType: 'currency', targetId: currency }
  const bad = await auditFirst(ctx, ip, { ...e, after: { enabled: body.enabled } })
  if (bad) return bad
  const { error } = await admin.from('payment_currencies').upsert({ currency, enabled: body.enabled })
  if (error) {
    await auditFailed(ctx, ip, e, error.message)
    return json(500, { error: error.message })
  }
  return json(200, { ok: true })
}

async function countrySave({ ctx, admin, body, ip }) {
  if (!can(ctx, 'pricing.manage')) return json(403, { error: 'You don’t have permission to set prices' })
  const code = String(body.country_code || '').toUpperCase()
  const currency = String(body.currency || '').toUpperCase()
  const vat = Number(body.vat_percent)
  if (!/^[A-Z]{2}$/.test(code) || !Number.isFinite(vat) || vat < 0 || vat > 50) return json(400, { error: 'Choose a country and a VAT between 0 and 50' })
  const { data: cur } = await admin.from('payment_currencies').select('currency').eq('currency', currency).maybeSingle()
  if (!cur) return json(400, { error: 'That currency is not in the currency list yet' })
  const fields = { country_code: code, name: countryName(code), currency, vat_percent: Math.round(vat * 100) / 100, updated_by: ctx.user.id, updated_at: new Date().toISOString() }
  const e = { action: 'country.save', targetType: 'country', targetId: code }
  const bad = await auditFirst(ctx, ip, { ...e, after: fields })
  if (bad) return bad
  const { error } = await admin.from('country_settings').upsert(fields)
  if (error) {
    await auditFailed(ctx, ip, e, error.message)
    return json(500, { error: error.message })
  }
  return json(200, { ok: true })
}

async function countryDelete({ ctx, admin, body, ip }) {
  if (!can(ctx, 'pricing.manage')) return json(403, { error: 'You don’t have permission to set prices' })
  const code = String(body.country_code || '').toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return json(400, { error: 'Bad request' })
  const e = { action: 'country.delete', targetType: 'country', targetId: code }
  const bad = await auditFirst(ctx, ip, e)
  if (bad) return bad
  const { error } = await admin.from('country_settings').delete().eq('country_code', code)
  if (error) {
    await auditFailed(ctx, ip, e, error.message)
    return json(500, { error: error.message })
  }
  return json(200, { ok: true })
}

async function quote({ ctx, admin, body }) {
  if (!can(ctx, 'pricing.manage') && !can(ctx, 'ads.billing.view')) return json(403, { error: 'Not allowed' })
  const q = await resolveQuote(admin, { country: body.country, placement: body.placement, days: body.days })
  if (q.error) return json(400, { error: q.error })
  return json(200, { ok: true, quote: q })
}
