import { createBrowserClient } from '@supabase/ssr'

let client = null

// Created only when needed (never while the page is being built), so the
// build still works before the environment variables are added in Vercel.
export function getBrowserClient() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
  }
  return client
}
