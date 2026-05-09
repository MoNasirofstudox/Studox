// Service Worker — Studox OS
// Handles: web push notification display + click routing

self.addEventListener('push', event => {
  if (!event.data) return

  let payload = {}
  try { payload = event.data.json() }
  catch { payload = { title: 'Studox OS', body: event.data.text() } }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Studox OS', {
      body:    payload.body  || '',
      icon:    '/icon-192.png',
      badge:   '/badge-72.png',
      data:    { url: payload.url || '/' },
      vibrate: [200, 100, 200],
      tag:     'studox-notification',
      renotify: true,
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})

// Activate immediately — skip waiting
self.addEventListener('install',  () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(clients.claim()))
