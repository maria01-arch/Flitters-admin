import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// The email confirmation link lands here. Supabase has already confirmed the
// address by the time we get the code, so if signing in from the code fails
// (for example the link was opened in a different browser), the person just
// signs in normally.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  let next = searchParams.get('next') || '/'
  if (!next.startsWith('/') || next.startsWith('//')) next = '/'
  if (code) {
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) return NextResponse.redirect(origin + next)
    } catch {}
  }
  return NextResponse.redirect(origin + '/login?confirmed=1')
}
