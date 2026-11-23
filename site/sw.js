// VAlex - service worker des notifications push.
//
// Il affiche uniquement la charge utile recue du serveur. Aucun cache, aucune
// donnee d'authentification, aucune reponse inventee. Une notification dont
// l'URL sort du site retombe sur l'accueil.

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
