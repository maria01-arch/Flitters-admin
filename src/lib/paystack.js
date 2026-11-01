import 'server-only'
import crypto from 'crypto'

const BASE = 'https://api.paystack.co'

async function ps(path, options = {}) {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) throw new Error('Payments are not set up yet')
  const res = await fetch(BASE + path, {
    ...options,
    cache: 'no-store',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
  })
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok && body.status === true, status: res.status, body }
}

// Amounts are in the smallest unit (kobo for NGN, cents for USD).
export function initializeTransaction({ email, amount, currency, reference, callback_url, metadata }) {
  return ps('/transaction/initialize', { method: 'POST', body: JSON.stringify({ email, amount, currency, reference, callback_url, metadata }) })
}

export function verifyTransaction(reference) {
  return ps('/transaction/verify/' + encodeURIComponent(reference))
}

// Paystack signs every webhook with your secret key (HMAC SHA-512 of the raw body).
export function verifySignature(raw, signature) {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key || !signature) return false
  const expected = crypto.createHmac('sha512', key).update(raw).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(String(signature))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
