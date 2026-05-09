// Supabase Edge Function: paystack-webhook
// Endpoint: POST /functions/v1/paystack-webhook
// Configure in Paystack dashboard: Settings → Webhooks → add this URL
//
// Required secrets:
//   PAYSTACK_SECRET_KEY   — from Paystack dashboard (sk_live_... or sk_test_...)
//   SUPABASE_URL          — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto }        from 'https://deno.land/std@0.177.0/crypto/mod.ts'

const PAYSTACK_SECRET    = Deno.env.get('PAYSTACK_SECRET_KEY')!
const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE)

// ─── Verify Paystack HMAC-SHA512 signature ────────────────────
async function verifySignature(body: string, signature: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(PAYSTACK_SECRET),
    { name: 'HMAC', hash: 'SHA-512' },
    false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('')
  return hex === signature
}

// ─── Paystack event: charge.success ──────────────────────────
async function handleChargeSuccess(data: Record<string, unknown>) {
  const ref       = data.reference as string
  const amount    = (data.amount as number) / 100     // Paystack sends kobo
  const metadata  = (data.metadata || {}) as Record<string, string>
  const invoiceId = metadata.invoice_id
  const personId  = metadata.person_id || (data.customer as Record<string,string>)?.metadata?.person_id

  if (!invoiceId) {
    console.warn('paystack-webhook: charge.success without invoice_id in metadata', ref)
    return
  }

  // Record the payment
  const { data: result, error } = await supabase.rpc('rpc_record_payment', {
    p_invoice_id: invoiceId,
    p_amount:     amount,
    p_method:     'paystack',
    p_reference:  ref,
    p_person_id:  personId || null,
  })

  if (error) {
    console.error('paystack-webhook: rpc_record_payment failed', error.message)
    return
  }

  // If now fully paid, enqueue confirmation email
  if (personId && result?.new_status === 'paid') {
    // Get invoice details for the email
    const { data: inv } = await supabase
      .from('student_invoices')
      .select(`
        total_amount, paid_amount, session_id,
        persons!student_invoices_student_id_fkey(email, first_name, last_name),
        academic_sessions(name)
      `)
      .eq('id', invoiceId)
      .single()

    if (inv) {
      const person = inv.persons as Record<string, string>
      await supabase.rpc('rpc_enqueue_email', {
        p_institution_id: null,
        p_to_address:     person.email,
        p_to_name:        `${person.first_name} ${person.last_name}`,
        p_subject:        'Payment Confirmed — Studox OS',
        p_template:       'payment_confirmed',
        p_payload:        {
          student_name:  `${person.first_name} ${person.last_name}`,
          amount:        amount.toLocaleString('en-NG'),
          reference:     ref,
          session_name:  (inv.academic_sessions as Record<string,string>)?.name || '',
          is_cleared:    String(result.new_status === 'paid'),
        },
      })

      // Trigger immediate push notification
      await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE}`,
        },
        body: JSON.stringify({
          person_id: personId,
          title:     'Payment Confirmed',
          body:      `₦${amount.toLocaleString('en-NG')} received. Ref: ${ref}`,
          url:       '/student',
        }),
      }).catch(() => { /* non-critical */ })
    }
  }
}

// ─── Paystack event: transfer.success ────────────────────────
async function handleTransferSuccess(data: Record<string, unknown>) {
  // Log transfer events for audit purposes
  console.log('paystack-webhook: transfer.success', data.reference)
}

// ─── Main handler ─────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const body      = await req.text()
  const signature = req.headers.get('x-paystack-signature') || ''

  // Always verify
  const valid = await verifySignature(body, signature)
  if (!valid) {
    console.warn('paystack-webhook: invalid signature')
    return new Response('Unauthorized', { status: 401 })
  }

  let event: { event: string; data: Record<string, unknown> }
  try {
    event = JSON.parse(body)
  } catch {
    return new Response('Bad JSON', { status: 400 })
  }

  switch (event.event) {
    case 'charge.success':
      await handleChargeSuccess(event.data)
      break
    case 'transfer.success':
      await handleTransferSuccess(event.data)
      break
    default:
      // Acknowledge unknown events — Paystack expects 200
      break
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
