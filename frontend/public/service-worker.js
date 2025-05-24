const CACHE_NAME = "xcargo-v1";
const urlsToCache = ["/", "/index.html", "/icons/LogoX.png", "/iconsLogoX.png"];

self.addEventListener("install", (event) => {
  console.log("[SW] Instalado");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});
