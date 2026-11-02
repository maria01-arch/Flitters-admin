import 'server-only'

// Price for one campaign. Order: the country's own price in the country's
// currency, then the all-regions price in that currency, then the all-regions
// USD price (the advertiser then pays in USD).
export async function resolveQuote(admin, { country, placement, days }) {
  const cc = String(country || '').toUpperCase()
  const d = Math.floor(Number(days))
  if (!/^[A-Z]{2}$/.test(cc)) return { error: 'Choose a country' }
  if (!['feed', 'reel'].includes(placement)) return { error: 'Choose feed or reel' }
  if (!Number.isFinite(d) || d < 1) return { error: 'Choose how many days' }

  const { data: cs } = await admin.from('country_settings').select('*').eq('country_code', cc).maybeSingle()
  const { data: enabled } = await admin.from('payment_currencies').select('currency').eq('enabled', true)
  const enabledSet = new Set((enabled || []).map((r) => r.currency))
  const vat = cs ? Number(cs.vat_percent) : 0
  const { data: rules } = await admin.from('ad_price_rules').select('*').eq('active', true).eq('placement', placement)
  const find = (country_code, currency) => (rules || []).find((r) => (r.country_code || null) === country_code && r.currency === currency)

  // Fallback currency: USD when it is on, otherwise the first currency that is on.
  const fallback = enabledSet.has('USD') ? 'USD' : Array.from(enabledSet).sort()[0]
  if (!fallback) return { error: 'No payment currency is switched on' }
  let currency = cs && enabledSet.has(cs.currency) ? cs.currency : fallback
  let rule = find(cc, currency) || find(null, currency)
  if (!rule && currency !== fallback) {
    currency = fallback
    rule = find(null, fallback)
  }
  if (!rule) return { error: 'No price is set for this placement yet' }
  if (d < rule.min_days || d > rule.max_days) return { error: 'This price allows ' + rule.min_days + ' to ' + rule.max_days + ' days' }

  const subtotal = Number(rule.price_per_day_minor) * d
  const vatMinor = Math.round((subtotal * vat) / 100)
  return {
    currency,
    rule_id: rule.id,
    rule_scope: rule.country_code || 'all regions',
    price_per_day_minor: Number(rule.price_per_day_minor),
    days: d,
    subtotal_minor: subtotal,
    vat_percent: vat,
    vat_minor: vatMinor,
    total_minor: subtotal + vatMinor,
  }
}
