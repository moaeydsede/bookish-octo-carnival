const CACHE_NAME = "ordered-pro-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./admin.html",
  "./sales.html",
  "./warehouse.html",
  "./order.html",
  "./styles.css",
  "./firebase.js",
  "./app.js",
  "./guard.js",
  "./utils.js",
  "./admin.js",
  "./sales.js",
  "./warehouse.js",
  "./order.js",
  "./manifest.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE_NAME ? caches.delete(k) : null)))
  );
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request))
  );
});
