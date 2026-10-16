/* Mundo Neurodiverso — service worker mínimo.
   Estrategia: red primero y, sin señal, la copia guardada. Así siempre se ve la versión
   más nueva, pero la app abre aunque no haya internet.
   Solo guarda archivos de este sitio: los datos de pacientes vienen de Supabase y nunca se guardan aquí. */
const CACHE = "consultorio-v2";
const BASE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); }
        return r;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});

/* ---------- Avisos (los manda la función "avisar" de Supabase, cifrados) ---------- */
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data.json(); } catch (_) { d = { title: "Consultorio", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Consultorio", {
    body: d.body || "", icon: "./icon-192.png", badge: "./icon-192.png",
    tag: d.tag || "consultorio", renotify: true, data: { url: "./" }
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(lista => {
      for (const c of lista) if (c.url.startsWith(self.location.origin) && "focus" in c) return c.focus();
      return self.clients.openWindow("./");
    })
  );
});
