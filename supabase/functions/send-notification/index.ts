// Supabase Edge Function: send-notification
// Triggered by: cron every 2 minutes, or direct invocation from app
// Responsibilities:
//   1. Drain email_queue via Resend
//   2. Send web push to registered tokens via Web Push Protocol
//
// Required secrets (set via: supabase secrets set KEY=value):
//   RESEND_API_KEY      — from resend.com
//   VAPID_PUBLIC_KEY    — generate with: npx web-push generate-vapid-keys
//   VAPID_PRIVATE_KEY   — as above
//   VAPID_SUBJECT       — mailto:admin@yourdomain.com

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY= Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT    = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@studox.app'
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ─── Email templates ─────────────────────────────────────────
function buildEmailHtml(template: string, payload: Record<string, string>): string {
  const base = (content: string) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #f8f9ff; margin: 0; padding: 0; }
  .wrap { max-width: 560px; margin: 40px auto; background: #fff; border: 1px solid #e0e4f0; }
  .header { background: #131b2e; color: #fff; padding: 28px 32px; }
  .header h1 { margin: 0; font-size: 20px; font-weight: 900; letter-spacing: -0.5px; }
  .header p  { margin: 4px 0 0; font-size: 12px; opacity: 0.6; text-transform: uppercase; letter-spacing: 1px; }
  .body { padding: 28px 32px; color: #0b1c30; font-size: 14px; line-height: 1.6; }
  .pill { display: inline-block; background: #dae2fd; color: #131b2e; font-size: 11px;
          font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; padding: 3px 10px; }
  .value { font-size: 28px; font-weight: 900; color: #131b2e; margin: 8px 0; }
  .footer { padding: 16px 32px; font-size: 11px; color: #8a9bb5; border-top: 1px solid #e0e4f0; }
</style></head>
<body><div class="wrap">
  <div class="header"><h1>Studox OS</h1><p>Academic Management Platform</p></div>
  <div class="body">${content}</div>
  <div class="footer">This is an automated message from Studox OS. Do not reply to this email.</div>
</div></body></html>`

  switch (template) {
    case 'result_published':
      return base(`
        <span class="pill">Results Published</span>
        <p style="margin-top:16px">Dear <strong>${payload.student_name || 'Student'}</strong>,</p>
        <p>Results for <strong>${payload.course_code} — ${payload.course_name}</strong> have been published.</p>
        <p>Log in to your Student Portal to view your grade and transcript.</p>
        <p>Institution: ${payload.institution_name || ''}</p>`)

    case 'assignment_graded':
      return base(`
        <span class="pill">Assignment Graded</span>
        <p style="margin-top:16px">Dear <strong>${payload.student_name || 'Student'}</strong>,</p>
        <p>Your submission for <strong>${payload.assignment_title}</strong> has been graded.</p>
        <div class="value">${payload.score} / ${payload.max_score}</div>
        ${payload.comment ? `<p style="background:#f8f9ff;padding:12px;border-left:3px solid #131b2e">${payload.comment}</p>` : ''}
        <p>Log in to view your full feedback.</p>`)

    case 'payment_confirmed':
      return base(`
        <span class="pill">Payment Confirmed</span>
        <p style="margin-top:16px">Dear <strong>${payload.student_name || 'Student'}</strong>,</p>
        <p>A payment of <strong>₦${payload.amount}</strong> has been recorded on your account.</p>
        <p>Reference: <code>${payload.reference || '—'}</code></p>
        <p>Session: ${payload.session_name || ''}</p>
        ${payload.is_cleared === 'true' ? '<p style="color:#1a7a4a;font-weight:bold">✓ Your account is now financially cleared.</p>' : ''}`)

    case 'clearance_updated':
      return base(`
        <span class="pill">Clearance Status Updated</span>
        <p style="margin-top:16px">Dear <strong>${payload.student_name || 'Student'}</strong>,</p>
        <p>Your financial clearance status for <strong>${payload.session_name}</strong> has been updated.</p>
        <div class="value" style="color:${payload.is_cleared === 'true' ? '#1a7a4a' : '#c0392b'}">
          ${payload.is_cleared === 'true' ? 'CLEARED' : 'NOT CLEARED'}
        </div>
        ${payload.override_reason ? `<p>Note: ${payload.override_reason}</p>` : ''}
        <p>Log in to your Student Portal for details.</p>`)

    default:
      return base(`<p>${JSON.stringify(payload)}</p>`)
  }
}

// ─── Send one email via Resend ────────────────────────────────
async function sendEmail(email: {
  id: string; to_address: string; to_name: string | null;
  subject: string; template: string; payload: Record<string, string>
}) {
  const html = buildEmailHtml(email.template, email.payload)
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    'Studox OS <noreply@studox.app>',
      to:      email.to_name ? `${email.to_name} <${email.to_address}>` : email.to_address,
      subject: email.subject,
      html,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    await supabase.rpc('rpc_mark_email_sent', { p_id: email.id, p_error: err })
    return false
  }
  await supabase.rpc('rpc_mark_email_sent', { p_id: email.id })
  return true
}

// ─── VAPID signing for web push ───────────────────────────────
// Uses the Web Push Protocol with ECDH + AES-GCM encryption
// Full implementation using SubtleCrypto (available in Deno)

async function importVapidKey(privateKeyB64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(privateKeyB64.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0))
  return crypto.subtle.importKey(
    'raw', raw,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, ['deriveKey', 'deriveBits']
  )
}

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function buildVapidHeader(endpoint: string): Promise<string> {
  const origin = new URL(endpoint).origin
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600
  const header = b64url(new TextEncoder().encode(JSON.stringify({ typ:'JWT', alg:'ES256' })))
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ aud: origin, exp, sub: VAPID_SUBJECT })))
  const signingInput = `${header}.${payload}`

  const keyData = Uint8Array.from(atob(VAPID_PRIVATE_KEY.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0))
  const key = await crypto.subtle.importKey(
    'raw', keyData,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  )
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput)
  )
  return `vapid t=${signingInput}.${b64url(sig)},k=${VAPID_PUBLIC_KEY}`
}

async function encryptPayload(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string
): Promise<{ ciphertext: ArrayBuffer; salt: Uint8Array; serverPublicKey: ArrayBuffer }> {
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // Import client's P-256 public key
  const clientKeyRaw = Uint8Array.from(atob(subscription.p256dh.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0))
  const clientKey = await crypto.subtle.importKey(
    'raw', clientKeyRaw,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, []
  )

  // Generate server ephemeral key pair
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, ['deriveKey', 'deriveBits']
  )
  const serverPublicKey = await crypto.subtle.exportKey('raw', serverKeyPair.publicKey)

  // ECDH shared secret
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientKey },
    serverKeyPair.privateKey, 256
  )

  // Auth secret
  const authSecret = Uint8Array.from(atob(subscription.auth.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0))

  // HKDF for content encryption key and nonce
  const prkKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey'])
  const contentKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: new TextEncoder().encode('Content-Encoding: aes128gcm\0') },
    prkKey, { name: 'AES-GCM', length: 128 }, false, ['encrypt']
  )
  const nonceBuf = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: new TextEncoder().encode('Content-Encoding: nonce\0') },
    prkKey, 96
  )

  const plaintext = new TextEncoder().encode(payload)
  const padded = new Uint8Array(plaintext.length + 1)
  padded.set(plaintext); padded[plaintext.length] = 2 // record delimiter

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonceBuf },
    contentKey, padded
  )

  return { ciphertext, salt, serverPublicKey }
}

async function sendPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  notification: { title: string; body: string; url?: string }
) {
  const payload = JSON.stringify({ title: notification.title, body: notification.body, url: notification.url || '/' })
  const { ciphertext, salt, serverPublicKey } = await encryptPayload(subscription, payload)

  // Build content-encoding header value (RFC 8188 aes128gcm)
  const header = new Uint8Array(salt.length + 4 + 1 + (serverPublicKey as ArrayBuffer).byteLength)
  header.set(salt)
  new DataView(header.buffer).setUint32(16, 4096, false)
  header[20] = (serverPublicKey as ArrayBuffer).byteLength
  header.set(new Uint8Array(serverPublicKey as ArrayBuffer), 21)
  const body = new Uint8Array(header.length + (ciphertext as ArrayBuffer).byteLength)
  body.set(header); body.set(new Uint8Array(ciphertext as ArrayBuffer), header.length)

  const vapidHeader = await buildVapidHeader(subscription.endpoint)

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization':     vapidHeader,
      'Content-Type':      'application/octet-stream',
      'Content-Encoding':  'aes128gcm',
      'TTL':               '86400',
    },
    body,
  })

  // 410 Gone = subscription expired, deactivate it
  if (res.status === 410) {
    await supabase.from('push_tokens').update({ is_active: false }).eq('endpoint', subscription.endpoint)
  }

  return res.ok || res.status === 201
}

// ─── Main handler ─────────────────────────────────────────────
Deno.serve(async (req) => {
  // Allow direct invocation with a JSON body { person_id, title, body, url }
  // for immediate push, or no body for queue drain mode
  let directPush: { person_id?: string; title?: string; body?: string; url?: string } | null = null

  if (req.method === 'POST' && req.headers.get('content-type')?.includes('application/json')) {
    try { directPush = await req.json() } catch { /* drain mode */ }
  }

  const results = { emails_sent: 0, emails_failed: 0, pushes_sent: 0, pushes_failed: 0 }

  // ── Direct push ──
  if (directPush?.person_id && directPush?.title) {
    const { data: tokens } = await supabase.rpc('rpc_get_push_tokens', { p_person_id: directPush.person_id })
    for (const token of tokens || []) {
      const ok = await sendPush(token, { title: directPush.title, body: directPush.body || '', url: directPush.url })
      ok ? results.pushes_sent++ : results.pushes_failed++
    }
    return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } })
  }

  // ── Email queue drain ──
  const { data: pending } = await supabase.rpc('rpc_get_pending_emails', { p_limit: 50 })
  for (const email of pending || []) {
    const ok = await sendEmail(email)
    ok ? results.emails_sent++ : results.emails_failed++
  }

  return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } })
})
