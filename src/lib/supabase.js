import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Graceful fallback — app will show config error at runtime rather than
// crashing the build. Vercel needs the build to succeed even before
// env vars are set in the dashboard.
if (!url || !key) {
  console.error(
    '[Studox] Missing env vars: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY\n' +
    'Set these in Vercel → Project → Settings → Environment Variables'
  )
}

export const supabase = createClient(
  url  || 'https://placeholder.supabase.co',
  key  || 'placeholder-key'
)
