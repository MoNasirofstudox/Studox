// usePushNotifications — Web Push subscription management
//
// Setup:
//   1. Generate VAPID keys: npx web-push generate-vapid-keys
//   2. Add VITE_VAPID_PUBLIC_KEY to .env
//   3. Add VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY to Supabase secrets
//
// The service worker (public/sw.js) must be deployed alongside the app.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export function usePushNotifications(personId) {
  const [supported,    setSupported]    = useState(false)
  const [subscribed,   setSubscribed]   = useState(false)
  const [subscribing,  setSubscribing]  = useState(false)
  const [error,        setError]        = useState(null)

  useEffect(() => {
    setSupported('serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY)
  }, [])

  useEffect(() => {
    if (!supported || !personId) return
    // Check if already subscribed
    navigator.serviceWorker.ready.then(reg =>
      reg.pushManager.getSubscription()
    ).then(sub => {
      setSubscribed(!!sub)
    }).catch(() => {})
  }, [supported, personId])

  const subscribe = useCallback(async () => {
    if (!supported || !personId) return
    setSubscribing(true); setError(null)

    try {
      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()

      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
      }

      const json = sub.toJSON()
      const { error: rpcErr } = await supabase.rpc('rpc_register_push_token', {
        p_person_id:  personId,
        p_endpoint:   json.endpoint,
        p_p256dh:     json.keys.p256dh,
        p_auth:       json.keys.auth,
        p_user_agent: navigator.userAgent.substring(0, 200),
      })

      if (rpcErr) throw new Error(rpcErr.message)
      setSubscribed(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setSubscribing(false)
    }
  }, [supported, personId])

  const unsubscribe = useCallback(async () => {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await supabase.from('push_tokens').update({ is_active: false }).eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
    }
    setSubscribed(false)
  }, [])

  return { supported, subscribed, subscribing, error, subscribe, unsubscribe }
}
