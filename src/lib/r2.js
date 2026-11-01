import 'server-only'
import { S3Client, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

const PUBLIC_HOST = process.env.R2_PUBLIC_HOST || 'media.xchord.space'

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
    })
  }
  return s3
}

// https://media.xchord.space/posts/<id>/file.jpg  ->  posts/<id>/file.jpg
// Also understands Cloudflare image-resizing links (/cdn-cgi/image/<options>/<key>).
export function keyFromUrl(u) {
  try {
    const url = new URL(u)
    if (url.protocol !== 'https:' || url.hostname !== PUBLIC_HOST) return null
    let path = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    if (path.startsWith('cdn-cgi/image/')) {
      const rest = path.slice('cdn-cgi/image/'.length)
      const i = rest.indexOf('/')
      if (i === -1) return null
      path = rest.slice(i + 1)
    }
    if (!path || path.includes('..') || path.includes('//')) return null
    return path
  } catch {
    return null
  }
}

// Every text column ending in _url (image_url, video_url, thumbnail_url ...).
export function urlsFromRows(rows) {
  const out = new Set()
  for (const row of rows || []) {
    for (const [k, v] of Object.entries(row || {})) {
      if (/_url$/.test(k) && typeof v === 'string' && v.startsWith('https://')) out.add(v)
    }
  }
  return Array.from(out)
}

// Another post, reel or comment may still use the same file.
async function stillUsed(admin, url) {
  const checks = [['posts', 'image_url'], ['posts', 'video_url'], ['reels', 'video_url'], ['comments', 'image_url']]
  for (const [table, col] of checks) {
    const { count, error } = await admin.from(table).select('id', { count: 'exact', head: true }).eq(col, url)
    if (error) {
      if (/column|does not exist|schema cache/i.test(error.message)) continue
      return true // can't tell, so keep the file
    }
    if (count > 0) return true
  }
  return false
}

// Deletes files after the database rows are gone. Only touches files inside the
// owner's own folders (for example posts/<userId>/), never anything else.
export async function cleanupMedia(admin, urls, allowedPrefixes) {
  const result = { configured: r2Configured(), deleted: [], skipped: [], failed: [] }
  if (!result.configured) return result
  const seen = new Set()
  for (const url of urls) {
    const key = keyFromUrl(url)
    if (!key || seen.has(key)) continue
    seen.add(key)
    if (!allowedPrefixes.some((p) => key.startsWith(p))) {
      result.skipped.push(key)
      continue
    }
    try {
      if (await stillUsed(admin, url)) {
        result.skipped.push(key)
        continue
      }
      await client().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }))
      result.deleted.push(key)
    } catch (err) {
      console.error('R2 delete failed:', key, err && err.message)
      result.failed.push(key)
    }
  }
  return result
}

export function publicUrlFor(key) {
  return 'https://' + PUBLIC_HOST + '/' + key
}

export async function putObject(key, body, contentType) {
  await client().send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key, Body: body, ContentType: contentType }))
}
