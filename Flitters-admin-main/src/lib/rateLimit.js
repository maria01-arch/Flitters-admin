// Simple in-memory limiter. Per server instance, so it is a speed bump,
// not a perfect wall. Supabase also rate-limits sign-ins on its side.
const buckets = new Map()

export function rateLimited(key, limit, windowMs) {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || now > b.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs })
    return false
  }
  b.count += 1
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k)
  }
  return b.count > limit
}
