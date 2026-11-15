import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import crypto from 'crypto'
import { getStaffForApi, can } from '@/lib/staff'
import { writeAudit, clientIp } from '@/lib/audit'
import { rateLimited } from '@/lib/rateLimit'
import { r2Configured, putObject, publicUrlFor } from '@/lib/r2'

export const runtime = 'nodejs'

const MAX = 4 * 1024 * 1024 // Vercel functions accept about 4.5 MB per request
const json = (status, body) => NextResponse.json(body, { status })

function sniff(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' }
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { ext: 'png', type: 'image/png' }
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return { ext: 'webp', type: 'image/webp' }
  return null
}

// Image upload for house ads: staff with ads.edit only, files go to ads/house/.
export async function POST(req) {
  const ip = clientIp(headers())
  let ctx
  try { ctx = await getStaffForApi(true) } catch (e) { console.error(e); return json(500, { error: 'Server error' }) }
  if (ctx.error === 'signed_out' || ctx.error === 'mfa_required') return json(401, { error: 'Please sign in again' })
  if (ctx.error || !can(ctx, 'ads.edit')) return json(403, { error: 'Not allowed' })
  if (rateLimited('upload:' + ctx.user.id, 20, 60_000)) return json(429, { error: 'Slow down a little and try again' })
  if (!r2Configured()) return json(400, { error: 'Storage is not set up yet (the R2 variables in Vercel).' })

  let file
  try {
    const form = await req.formData()
    file = form.get('file')
  } catch {
    return json(400, { error: 'Bad upload' })
  }
  if (!file || typeof file.arrayBuffer !== 'function') return json(400, { error: 'Choose an image' })
  if (file.size > MAX) return json(400, { error: 'The image is too big. Use one under 4 MB.' })
  const buf = Buffer.from(await file.arrayBuffer())
  const kind = sniff(buf)
  if (!kind) return json(400, { error: 'Only JPG, PNG or WebP images are allowed' })

  const key = 'ads/house/' + Date.now() + '_' + crypto.randomBytes(6).toString('hex') + '.' + kind.ext
  try {
    await writeAudit({ actor: ctx.user, ip, action: 'ad.house_upload', targetType: 'file', targetId: key, meta: { bytes: buf.length } })
  } catch (e) {
    console.error(e)
    return json(500, { error: 'The audit log could not be written, so nothing was uploaded.' })
  }
  try {
    await putObject(key, buf, kind.type)
  } catch (e) {
    console.error(e)
    return json(500, { error: 'Upload failed' })
  }
  return json(200, { ok: true, url: publicUrlFor(key) })
}
