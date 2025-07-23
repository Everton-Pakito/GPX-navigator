self.addEventListener('install', e => {
  e.waitUntil(
    caches.open('gpx-cache-v3').then(cache => {
      return cache.addAll([
        './',
        './index.html',
        './style.css',
        './app.js',
        './manifest.json',
        './routes.json',
        './routes/exemplo.gpx'
      ]);
    })
  );
});
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});