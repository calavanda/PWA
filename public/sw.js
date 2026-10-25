/**
 * GeoField PWA - Service Worker v1.0.0
 * Estrategias de Caché:
 * - Cache-First para App Shell y assets estáticos.
 * - Stale-While-Revalidate para recursos complementarios.
 * - Network-First con fallback a caché para recursos dinámicos.
 * - Manejo offline robusto y limpieza automática de versiones antiguas.
 */

const CACHE_NAME = 'geofield-app-v1';
const DYNAMIC_CACHE = 'geofield-dynamic-v1';

// Recursos críticos del App Shell para funcionamiento 100% offline
const APP_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-maskable-192x192.png',
  '/icons/icon-maskable-512x512.png',
  '/icons/apple-touch-icon.png',
  '/icons/badge-72x72.png',
  '/icons/favicon-32x32.png'
];

// 1. INSTALACIÓN: Pre-cachear App Shell y forzar activación inmediata
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Instalando versión:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-cacheando recursos del App Shell');
      return cache.addAll(APP_SHELL_ASSETS).catch((err) => {
        console.warn('[Service Worker] Algunos assets estáticos fallaron al pre-cachear (se resolverán en tiempo de ejecución):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// 2. ACTIVACIÓN: Limpiar cachés obsoletos y tomar control de clientes
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activado y listo.');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME && name !== DYNAMIC_CACHE) {
            console.log('[Service Worker] Eliminando caché antiguo:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. FETCH: Estrategias de caché según el tipo de solicitud
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignorar peticiones no HTTP/HTTPS o esquemas chrome-extension
  if (!url.protocol.startsWith('http')) return;

  // Ignorar peticiones de desarrollo de Vite (HMR, ws, ping)
  if (url.pathname.includes('/@vite/') || url.pathname.includes('/@fs/')) {
    return;
  }

  // Estrategia 1: Para navegaciones HTML (SPA) -> Network-first con fallback a cache App Shell (/index.html)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        })
        .catch(async () => {
          console.log('[Service Worker] Sin conexión: Entregando App Shell desde caché');
          const cached = await caches.match('/index.html');
          if (cached) return cached;
          return caches.match('/');
        })
    );
    return;
  }

  // Estrategia 2: Para mapas externos (OpenStreetMap / CartoDB / Tile servers) -> Stale-While-Revalidate
  if (url.hostname.includes('tile.openstreetmap.org') || url.hostname.includes('unpkg.com') || url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(DYNAMIC_CACHE).then(async (cache) => {
        const cachedRes = await cache.match(req);
        const fetchPromise = fetch(req)
          .then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              cache.put(req, networkRes.clone());
            }
            return networkRes;
          })
          .catch(() => cachedRes);

        return cachedRes || fetchPromise;
      })
    );
    return;
  }

  // Estrategia 3: Para assets estáticos locales (JS, CSS, Iconos, Imágenes) -> Cache-First con fallback a red
  event.respondWith(
    caches.match(req).then((cachedRes) => {
      if (cachedRes) {
        return cachedRes;
      }
      return fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        })
        .catch(() => {
          // Si es una imagen y falla, devolver un fallback o null
          if (req.destination === 'image') {
            return caches.match('/favicon.svg');
          }
        });
    })
  );
});

// 4. BACKGROUND SYNC (si el navegador lo soporta)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-reports') {
    console.log('[Service Worker] Evento Background Sync activado: sync-reports');
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'BACKGROUND_SYNC_TRIGGER' });
        });
      })
    );
  }
});

// 5. PUSH NOTIFICATIONS
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push recibido:', event);
  let payload = {
    title: 'GeoField - Notificación',
    body: 'Hay una actualización importante en tus reportes de campo.',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    data: { url: '/' }
  };

  if (event.data) {
    try {
      payload = Object.assign(payload, event.data.json());
    } catch {
      payload.body = event.data.text();
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon || '/icons/icon-192x192.png',
    badge: payload.badge || '/icons/badge-72x72.png',
    vibrate: [100, 50, 100],
    data: payload.data || { url: '/' },
    actions: [
      { action: 'open', title: 'Abrir Aplicación' },
      { action: 'close', title: 'Descartar' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

// 6. CLIC EN NOTIFICACIÓN
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// 7. MENSAJES DESDE EL CLIENTE (Skip waiting, ping, etc.)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
