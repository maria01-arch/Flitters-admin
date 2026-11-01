import { NextResponse } from 'next/server'
import { getAdvertiserContext } from '@/lib/advertiser'
import { rateLimited } from '@/lib/rateLimit'
import { r2Configured, putObject, newKey, publicUrlFor, MAX_IMAGE } from '@/lib/r2'

export const runtime = 'nodejs'
const json = (status, body) => NextResponse.json(body, { status })

function sniff(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' }
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { ext: 'png', type: 'image/png' }
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return { ext: 'webp', type: 'image/webp' }
  return null
}

// Ad images go into ads/<your advertiser id>/ and nowhere else.
export async function POST(req) {
  const ctx = await getAdvertiserContext()
  if (ctx.error === 'signed_out') return json(401, { error: 'Please sign in again' })
  if (ctx.error) return json(403, { error: 'Not allowed' })
  if (rateLimited('img:' + ctx.user.id, 30, 60_000)) return json(429, { error: 'Slow down a little and try again' })
  if (!r2Configured()) return json(400, { error: 'Uploads are not set up yet. Please try again later.' })

  let file
  try {
    file = (await req.formData()).get('file')
  } catch {
    return json(400, { error: 'Bad upload' })
  }
  if (!file || typeof file.arrayBuffer !== 'function') return json(400, { error: 'Choose an image' })
  if (file.size > MAX_IMAGE) return json(400, { error: 'That image is over 4 MB. Try a smaller one.' })
  const buf = Buffer.from(await file.arrayBuffer())
  const kind = sniff(buf)
  if (!kind) return json(400, { error: 'Use a JPG, PNG or WebP image' })

  const key = newKey(ctx.advertiser.id, kind.ext)
  try {
    await putObject(key, buf, kind.type)
  } catch (err) {
    console.error('Image upload failed:', err)
    return json(500, { error: 'Upload failed. Try again.' })
  }
  return json(200, { ok: true, key, url: publicUrlFor(key) })
}
