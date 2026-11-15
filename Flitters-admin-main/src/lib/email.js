import 'server-only'

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// Sends through Resend. If it isn't set up yet, nothing breaks: we report
// "not sent" and the screen shows what to do instead.
export async function sendEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM
  if (!key || !from) return { sent: false, reason: 'Email is not set up yet (RESEND_API_KEY and RESEND_FROM).' }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      return { sent: false, reason: 'Resend answered ' + res.status + ' ' + t.slice(0, 200) }
    }
    return { sent: true }
  } catch (err) {
    return { sent: false, reason: String((err && err.message) || err) }
  }
}
