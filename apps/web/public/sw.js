/* Only the generic offline document and public icon may enter this cache. */
const CACHE = "joint-static-shell-v1";
const STATIC = ["/offline.html", "/app-icon.svg"];
globalThis.self.addEventListener("install", (event) => {
  event.waitUntil(
    globalThis.caches
      .open(CACHE)
      .then((cache) => cache.addAll(STATIC))
      .then(() => globalThis.self.skipWaiting()),
  );
});
globalThis.self.addEventListener("activate", (event) => {
  event.waitUntil(
    globalThis.caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith("joint-static-shell-") && key !== CACHE,
            )
            .map((key) => globalThis.caches.delete(key)),
        ),
      )
      .then(() => globalThis.self.clients.claim()),
  );
});
globalThis.self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new globalThis.URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== globalThis.self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;
  if (request.mode === "navigate") {
    event.respondWith(
      globalThis.fetch(request).catch(() =>
        globalThis.caches
          .open(CACHE)
          .then((cache) => cache.match("/offline.html"))
          .then((response) => response || globalThis.Response.error()),
      ),
    );
  } else if (STATIC.includes(url.pathname) && !url.search) {
    event.respondWith(
      globalThis.caches
        .open(CACHE)
        .then((cache) => cache.match(url.pathname))
        .then((response) => response || globalThis.fetch(request)),
    );
  }
});
