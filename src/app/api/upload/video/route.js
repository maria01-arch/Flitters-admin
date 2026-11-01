import { NextResponse } from 'next/server'
import { getAdvertiserContext } from '@/lib/advertiser'
import { rateLimited } from '@/lib/rateLimit'
import { r2Configured, newKey, presignPut, MAX_VIDEO } from '@/lib/r2'

export const runtime = 'nodejs'
const json = (status, body) => NextResponse.json(body, { status })

// Gives the browser a short-lived link to upload one MP4 straight to storage.
// The file is checked again (size, type, first bytes) when the campaign is saved.
export async function POST(req) {
  const ctx = await getAdvertiserContext()
  if (ctx.error === 'signed_out') return json(401, { error: 'Please sign in again' })
  if (ctx.error) return json(403, { error: 'Not allowed' })
  if (rateLimited('vid:' + ctx.user.id, 10, 60 * 60_000)) return json(429, { error: 'You have uploaded a lot of videos. Try again in an hour.' })
  if (!r2Configured()) return json(400, { error: 'Uploads are not set up yet. Please try again later.' })

  let body
  try { body = await req.json() } catch { return json(400, { error: 'Bad request' }) }
  const size = Number(body.size)
  if (body.type !== 'video/mp4') return json(400, { error: 'Use an MP4 video' })
  if (!Number.isFinite(size) || size <= 0 || size > MAX_VIDEO) return json(400, { error: 'The video is too big. Use one under 30 MB.' })

  const key = newKey(ctx.advertiser.id, 'mp4')
  try {
    const url = await presignPut(key, 'video/mp4')
    return json(200, { ok: true, key, url })
  } catch (err) {
    console.error('Presign failed:', err)
    return json(500, { error: 'Could not start the upload. Try again.' })
  }
}
