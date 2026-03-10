// public/sw.js — Service Worker for push notifications

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.body || '',
      icon: data.icon || '/sofia-icon-192.png',
      badge: '/sofia-icon-192.png',
      tag: data.tag || 'sofia-proactive',
      renotify: true,
      data: { url: data.url || '/' },
      actions: [
        { action: 'open', title: 'Open Sofia' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    };
    event.waitUntil(self.registration.showNotification(data.title || 'Sofia', options));
  } catch (e) {
    console.error('[SW] Push parse error:', e);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
