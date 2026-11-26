// VAlex - service worker PWA.
//
// Deux responsabilites distinctes :
//   1. cache offline du shell et des assets statiques uniquement ;
//   2. affichage des notifications push recues du serveur.
//
// Aucune reponse utilisateur (auth, REST, profil, commande, paiement, wallet,
// message, notification privee, KYC) n'entre dans le cache. Aucun contenu de
// notification n'est invente : sans charge utile, un texte neutre s'affiche.

const CACHE = "valex-static-v1";
const OFFLINE_SHELL = "/";

const PRECACHE = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/favicon-32.png",
  "/ads-core.mjs",
  "/ads.js",
  "/pwa.js",
  "/push-core.mjs",
  "/push.js",
];

const STATIC_EXT = /\.(?:js|mjs|css|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|json)$/i;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(
      PRECACHE.map((path) => cache.add(new Request(path, { cache: "reload" }))),
    );
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith("valex-") && key !== CACHE)
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch (_) {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/sw.js") return;

  // Navigation : reseau d'abord, shell en cache seulement hors ligne.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch (_) {
        const cache = await caches.open(CACHE);
        const shell = await cache.match(OFFLINE_SHELL);
        if (shell) return shell;
        return new Response("Hors ligne", {
          status: 503,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }
    })());
    return;
  }

  // Assets statiques : cache d'abord, mise a jour en arriere-plan.
  if (!STATIC_EXT.test(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request);
    const network = fetch(request)
      .then((response) => {
        const control = response.headers.get("cache-control") || "";
        if (
          response.ok &&
          response.type === "basic" &&
          !/no-store|private/i.test(control)
        ) {
          cache.put(request, response.clone());
        }
        return response;
      })
      .catch(() => null);
    event.waitUntil(network.catch(() => {}));
    if (hit) return hit;
    const response = await network;
    return response || new Response("", { status: 504 });
  })());
});

// --- Notifications push ------------------------------------------------
const FALLBACK_TITLE = "VAlex Boutique";
const FALLBACK_BODY = "Nouvelle notification.";
const MAX_TITLE = 120;
const MAX_BODY = 500;
const MAX_TAG = 64;

function cleanText(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function sameSiteUrl(value) {
  try {
    const url = new URL(String(value || "/"), self.location.origin);
    if (url.origin !== self.location.origin) return "/";
    return url.pathname + url.search + url.hash;
  } catch (_) {
    return "/";
  }
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = {};
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    payload = {};
  }

  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  const title = cleanText(payload.title, MAX_TITLE) || FALLBACK_TITLE;
  const body = cleanText(payload.body, MAX_BODY) || FALLBACK_BODY;
  const tag = cleanText(data.tag || payload.tag, MAX_TAG) || "valex";
  const target = sameSiteUrl(data.url || payload.url || "/");

  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag,
    icon: "/icon-192.png",
    badge: "/favicon-32.png",
    data: { url: target },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = sameSiteUrl(event.notification.data && event.notification.data.url);

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    for (const client of windows) {
      try {
        const url = new URL(client.url);
        if (url.origin !== self.location.origin) continue;
        await client.focus();
        if ("navigate" in client) await client.navigate(target);
        return;
      } catch (_) {
        // Fenetre disparue : on continue avec les autres.
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
