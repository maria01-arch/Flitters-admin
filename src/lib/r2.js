import 'server-only'
import crypto from 'crypto'
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const PUBLIC_HOST = process.env.R2_PUBLIC_HOST || 'media.xchord.space'
export const MAX_IMAGE = 4 * 1024 * 1024
export const MAX_VIDEO = 30 * 1024 * 1024

export function r2Configured() {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET)
}

let s3 = null
function client() {
  if (!s3) {
    s3 = new S3Client({
      region: 'auto',
      endpoint: 'https://' + process.env.R2_ACCOUNT_ID + '.r2.cloudflarestorage.com',
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
      // Newer SDK versions add extra checksum fields to upload links that R2
      // rejects. Only use checksums when a request really needs one.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
  }
  return s3
}

export const publicUrlFor = (key) => 'https://' + PUBLIC_HOST + '/' + key

// The server picks every file name. The browser never chooses a path.
export function newKey(advertiserId, ext) {
  return 'ads/' + advertiserId + '/' + Date.now() + '_' + crypto.randomBytes(6).toString('hex') + '.' + ext
}

// A key is only accepted if it is inside this advertiser's own folder.
export function ownsKey(advertiserId, key) {
  return typeof key === 'string' && key.startsWith('ads/' + advertiserId + '/') && /^[a-zA-Z0-9/_.-]+$/.test(key) && !key.includes('..')
}

export function ownedKeyFromUrl(advertiserId, url) {
  try {
    const u = new URL(url)
    if (u.hostname !== PUBLIC_HOST) return null
    const key = decodeURIComponent(u.pathname.replace(/^\/+/, ''))
    return ownsKey(advertiserId, key) ? key : null
  } catch {
    return null
  }
}

export async function putObject(key, body, contentType) {
  await client().send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key, Body: body, ContentType: contentType }))
}

// A short-lived link the browser uploads a video to directly (Vercel itself
// only accepts about 4.5 MB per request).
export function presignPut(key, contentType) {
  return getSignedUrl(client(), new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key, ContentType: contentType }), { expiresIn: 600 })
}

export async function deleteObject(key) {
  try {
    await client().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }))
  } catch {}
}

async function head(key) {
  try {
    const r = await client().send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }))
    return { size: Number(r.ContentLength || 0), type: String(r.ContentType || '') }
  } catch {
    return null
  }
}

export async function verifyImage(key) {
  const h = await head(key)
  if (!h) return { ok: false, error: 'The image upload did not finish. Try again.' }
  if (h.size <= 0 || h.size > MAX_IMAGE) return { ok: false, error: 'The image is too big. Use one under 4 MB.' }
  if (!/^image\/(jpeg|png|webp)$/.test(h.type)) return { ok: false, error: 'Use a JPG, PNG or WebP image' }
  return { ok: true }
}

// Size, type and the first bytes (an MP4 starts with "ftyp" at byte 4).
export async function verifyVideo(key) {
  const h = await head(key)
  if (!h) return { ok: false, error: 'The video upload did not finish. Try again.' }
  let bad = null
  if (h.size <= 0 || h.size > MAX_VIDEO) bad = 'The video is too big. Use one under 30 MB.'
  else if (h.type !== 'video/mp4') bad = 'Use an MP4 video'
  else {
    try {
      const r = await client().send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key, Range: 'bytes=0-31' }))
      const bytes = Buffer.from(await r.Body.transformToByteArray())
      if (bytes.slice(4, 8).toString('latin1') !== 'ftyp') bad = 'That file is not a real MP4 video'
    } catch {
      bad = 'Could not check the video. Try again.'
    }
  }
  if (bad) {
    await deleteObject(key)
    return { ok: false, error: bad }
  }
  return { ok: true }
}
