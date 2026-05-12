// Service Worker — Nerds da Libras
// Agenda e dispara notificação do resultado da Lorena

self.addEventListener('message', event => {
  if (!event.data || event.data.type !== 'AGENDAR_RESULTADO') return;

  const delay = event.data.delay || 0;
  const nome  = event.data.nome  || '';

  setTimeout(() => {
    self.registration.showNotification('🤟 A Lorena respondeu!', {
      body: `${nome ? nome + ', o' : 'O'} seu resultado está pronto. Toque para ver.`,
      icon: '/fotos/IMG_4952.jpg',
      badge: '/fotos/IMG_4952.jpg',
      tag: 'resultado-lorena',
      requireInteraction: true,
      vibrate: [200, 100, 200],
      data: { url: self.location.origin + '/avaliacao.html' }
    });
  }, delay);
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/avaliacao.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('avaliacao') || c.url.includes('quiz')) {
          return c.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
