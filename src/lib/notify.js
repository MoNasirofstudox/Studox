// notify.js — app-layer notification helper
// Belt-and-suspenders for push: DB triggers handle email automatically.
// Call triggerPush() after high-value actions to ensure immediate delivery
// even if pg_net isn't configured in the database.

const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON    = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Fire-and-forget push notification for a person.
 * Calls the send-notification edge function directly.
 * Fails silently — never blocks the calling action.
 */
export async function triggerPush({ personId, title, body, url = '/' }) {
  if (!personId || !SUPABASE_URL) return
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON}`,
      },
      body: JSON.stringify({ person_id: personId, title, body, url }),
    })
  } catch {
    // Non-critical — DB trigger is the primary path
  }
}
