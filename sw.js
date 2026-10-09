/* ============================================================
   sw.js · Service Worker
   - Cachea la app (shell) para que funcione sin cobertura
   - NO intercepta el player de YouTube (debe ir siempre a la red)
   ============================================================ */
/* Sube este número (p. ej. v2, v3…) cada vez que publiques cambios:
   obliga al navegador a tirar la caché antigua y usar los ficheros nuevos. */
var VERSION = 'mis-videos-v2';
var SHELL = VERSION + '-shell';
var RUNTIME = VERSION + '-runtime';
var KEEP = [SHELL, RUNTIME];

var PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/store.js',
  './js/youtube.js',
  './js/player.js',
  './js/ui.js',
  './js/app.js',
  './icons/favicon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL).then(function (c) {
      // purga entradas viejas de versiones anteriores al reinstalar
      return c.keys().then(function (reqs) {
        return Promise.all(reqs.map(function (rq) {
          return /\.(js|css)$/.test(new URL(rq.url).pathname) ? c.delete(rq) : null;
        }));
      });
    }).then(function () {
      return caches.open(SHELL);
    }).then(function (c) {
      // addAll falla entero si un recurso falla: se añade de uno en uno
      return Promise.all(PRECACHE.map(function (url) {
        return c.add(new Request(url, { cache: 'reload' })).catch(function (err) {
          console.warn('[SW] no se pudo cachear', url, err && err.message);
        });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return KEEP.indexOf(k) === -1 ? caches.delete(k) : null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isShell(url) {
  return url.origin === self.location.origin &&
         (/\.(css|js|html|webmanifest|json|png|svg|jpg|woff2?)$/.test(url.pathname) || url.pathname.endsWith('/'));
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (x) { return; }

  // Nunca tocar: player de YouTube, APIs, ni nada que no sea GET estático propio
  if (url.hostname.indexOf('youtube') !== -1 ||
      url.hostname.indexOf('ytimg') !== -1 ||
      url.hostname.indexOf('google') !== -1 ||
      url.hostname.indexOf('noembed') !== -1) {
    return; // que vaya directo a la red
  }

  // Navegación: red primero, cache de respaldo (para modo offline)
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(RUNTIME).then(function (c) { c.put('./index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('./index.html', { ignoreSearch: true }).then(function (r) {
          return r || caches.match('./');
        });
      })
    );
    return;
  }

  // Iconos/imágenes propias: cache primero (no cambian nunca)
  if (isShell(url) && /\.(png|jpg|jpeg|svg|ico|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(function (cached) {
        if (cached) return cached;
        return fetch(req).then(function (res) {
          if (res && res.status === 200) {
            var copy = res.clone();
            caches.open(SHELL).then(function (c) { c.put(req, copy); });
          }
          return res;
        });
      })
    );
    return;
  }

  // Código (js/css): red primero -> siempre la última versión, con respaldo offline
  if (isShell(url)) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(SHELL).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (r) {
          return r || caches.match('./index.html');
        });
      })
    );
    return;
  }
});

self.addEventListener('message', function (e) {
  if (e.data === 'skipWaiting') self.skipWaiting();
});