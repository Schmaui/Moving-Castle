// Service Worker: läuft im Hintergrund und zeigt Benachrichtigungen an (siehe server/modules/push.js).
// Absichtlich OHNE Zwischenspeicher (Cache) – sonst kämen Updates der App verspätet an.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let msg = {};
  try { msg = event.data ? event.data.json() : {}; } catch { msg = { title: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(msg.title || 'moving castle', {
    body: msg.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: msg.tag,
    data: { url: msg.url || '/' },
  }));
});

// Antippen: App öffnen (oder die schon offene nach vorne holen) und zur richtigen Seite springen
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of open) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      await client.focus();
      client.postMessage({ type: 'open', url });
      return;
    }
    await self.clients.openWindow(url);
  })());
});
