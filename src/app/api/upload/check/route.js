import { NextResponse } from 'next/server'
import { getAdvertiserContext } from '@/lib/advertiser'
import { r2Configured, newKey, putObject, deleteObject, presignPut } from '@/lib/r2'

export const runtime = 'nodejs'
const json = (status, body) => NextResponse.json(body, { status }, )

// Open this while signed in to see whether storage is set up correctly.
// It shows no secrets: only lengths, the storage host, and what the upload
// link looks like.
export async function GET() {
  const ctx = await getAdvertiserContext()
  if (ctx.error === 'signed_out') return json(401, { error: 'Sign in first' })
  if (ctx.error) return json(403, { error: 'Not allowed' })

  const acct = process.env.R2_ACCOUNT_ID || ''
  const out = {
    configured: r2Configured(),
    accountIdLength: acct.length,
    accountIdLooksRight: /^[0-9a-f]{32}$/i.test(acct),
    bucket: process.env.R2_BUCKET || null,
    publicHost: process.env.R2_PUBLIC_HOST || 'media.xchord.space',
  }
  if (!out.configured) return json(200, out)

  try {
    const key = newKey(ctx.advertiser.id, 'txt')
    await putObject(key, Buffer.from('ok'), 'text/plain')
    await deleteObject(key)
    out.serverWrite = 'ok'
  } catch (e) {
    out.serverWrite = 'failed: ' + String((e && e.name) || '') + ' ' + String((e && e.message) || '').slice(0, 200)
  }

  try {
    const url = new URL(await presignPut(newKey(ctx.advertiser.id, 'mp4'), 'video/mp4'))
    out.uploadLinkHost = url.host.replace(/^[0-9a-f]{32}/i, '<account id>')
    out.uploadLinkParams = Array.from(url.searchParams.keys())
  } catch (e) {
    out.uploadLink = 'failed: ' + String((e && e.message) || '').slice(0, 200)
  }
  return json(200, out)
}
