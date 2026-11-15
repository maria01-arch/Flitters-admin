export const DURATIONS = [
  { value: '24', label: '1 day' },
  { value: '72', label: '3 days' },
  { value: '168', label: '7 days' },
  { value: '720', label: '30 days' },
  { value: 'perm', label: 'Permanent' },
]

// Talks to the moderation route. Sends people to /login if the session ended.
export async function call(body) {
  const res = await fetch('/api/moderation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await res.json().catch(() => ({}))
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Please sign in again')
  }
  if (!res.ok) throw new Error(j.error || 'Something went wrong (' + res.status + ')')
  return j
}
