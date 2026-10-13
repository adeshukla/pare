/*
 * Offline support. ADR-023.
 *
 * Pare has no server, so after the first visit there is nothing it needs the
 * network for except its own files. This worker keeps them:
 *
 *   - the page: network first, so a new deploy is picked up when online, and
 *     the cached copy when not;
 *   - everything else (hashed JS, CSS and the WASM codecs): cache first, filled
 *     as each one is first used. An encoder never used online is not available
 *     offline - the UI says exactly that.
 *
 * Each build registers this file with its own `?v=`, so a deploy gets a fresh
 * cache and the previous one is deleted on activation.
 */

const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = 'pare-' + VERSION;

/**
 * The page's own script and stylesheet load before this worker exists, so the
 * fetch handler never sees them. Read them out of the page and cache them now,
 * or an offline reload gets the page and nothing to run it.
 */
async function precacheShell() {
  const cache = await caches.open(CACHE);
  const response = await fetch('/', { cache: 'no-cache' });
  const html = await response.clone().text();
  await cache.put('/', response);
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  await cache.addAll([...new Set(assets)]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => n.startsWith('pare-') && n !== CACHE).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Files shared to Pare from another app (the Android share sheet, ADR-036).
 * The system POSTs them here; there is no server to take them, so the worker
 * does: they are kept in a cache of their own - not a 'pare-' one, which a
 * deploy would delete - and the page is opened to pick them up and clear them.
 * They never leave the device.
 */
const SHARED = 'shared-files';

async function receiveShare(request) {
  const form = await request.formData();
  const cache = await caches.open(SHARED);
  for (const key of await cache.keys()) await cache.delete(key);
  let i = 0;
  for (const file of form.getAll('files')) {
    if (typeof file === 'string') continue;
    await cache.put(
      '/shared/' + i++,
      new Response(file, {
        headers: { 'content-type': file.type || 'application/octet-stream', 'x-name': encodeURIComponent(file.name) },
      }),
    );
  }
  return Response.redirect('/?shared=' + i, 303);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method === 'POST' && new URL(request.url).pathname === '/share-target') {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Each page under its own address (the task pages, ADR-035), without the
    // query; offline, a page never visited falls back to the main one.
    const key = new URL(request.url).pathname;
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(key, copy));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(key, { ignoreVary: true })
            .then((hit) => hit || caches.match('/', { ignoreVary: true })),
        ),
    );
    return;
  }

  event.respondWith(
    // ignoreVary: a host may send `Vary: Origin`, and a module script's request
    // carries an Origin header the cached one did not - an exact match then misses.
    caches.match(request, { ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
