import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Service-role client. Server only: this key must never reach a browser.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase environment variables are missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
