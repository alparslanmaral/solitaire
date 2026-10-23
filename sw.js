// Service worker: makes the game installable and playable offline.
//
// - The app shell is pre-cached on install.
// - Everything else on this origin (for example your own card images in assets/cards/)
//   is cached the first time it is used, so new content needs no changes here.
// - Requests are answered from the cache first and refreshed in the background, so an
//   update shows up on the *next* launch. Bump CACHE_VERSION to drop old caches.

const CACHE_VERSION = 'v3';
const CACHE = `solitaire-${CACHE_VERSION}`;

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/base.css',
  'css/backgrounds.css',
  'css/glass.css',
  'css/board.css',
  'css/dialogs.css',
  'css/multiplayer.css',
  'js/main.js',
  'js/backgrounds.js',
  'js/core/cards.js',
  'js/core/klondike.js',
  'js/core/rng.js',
  'js/core/scoring.js',
  'js/core/solver.js',
  'js/core/solver.worker.js',
  'js/core/winnable.js',
  'js/net/config.js',
  'js/net/emitter.js',
  'js/net/match.js',
  'js/net/protocol.js',
  'js/net/synced-game.js',
  'js/net/transport.js',
  'js/cards/index.js',
  'js/cards/registry.js',
  'js/cards/image-pack.js',
  'js/cards/suits.js',
  'js/cards/themes/classic.js',
  'js/cards/themes/modern.js',
  'js/cards/themes/midnight.js',
  'js/services/appearance.js',
  'js/services/pwa.js',
  'js/services/settings.js',
  'js/services/sound.js',
  'js/services/storage.js',
  'js/ui/board.js',
  'js/ui/dialogs.js',
  'js/ui/hud.js',
  'js/ui/multiplayer.js',
  'js/ui/results.js',
  'js/ui/toast.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('solitaire-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      const refresh = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      if (cached) {
        event.waitUntil(refresh);
        return cached;
      }
      return refresh.then((r) => r ?? caches.match('index.html'));
    }),
  );
});
