const CACHE_NAME = "kelime-kartlari-v1";

const APP_FILES = [
  "./",
  "./index.html",
  "./words.js",
  "./manifest.json"
];

// Service Worker kurulumu
self.addEventListener("install", event => {
  console.log("Kelime Kartları Service Worker kuruluyor...");

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

// Eski cache'leri temizle
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// İnternetten güncel dosyayı almaya çalış
// İnternet yoksa cache'den aç
self.addEventListener("fetch", event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {

        // Başarılı cevabı cache'e kaydet
        if (
          response &&
          response.status === 200 &&
          response.type === "basic"
        ) {
          const responseClone = response.clone();

          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }

        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});