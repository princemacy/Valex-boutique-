// VAlex - logique pure de l'abonnement push PWA.
// Aucun acces reseau, aucun secret. Importe par `push.js` et par les tests.
// Les cles VAPID publiques sont publiques par conception ; aucune cle privee
// ne doit jamais apparaitre ici.

export const PUSH_WORKER_URL = "/sw.js";
export const MAX_ACTIVE_SUBSCRIPTIONS = 10;

function base64UrlToBytes(value) {
  if (typeof value !== "string") throw new Error("cle_invalide");
  const raw = value.trim();
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(raw)) throw new Error("cle_invalide");
  const body = raw.replace(/=+$/, "");
  if (body.length % 4 === 1) throw new Error("cle_invalide");
  const padded = body.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (body.length % 4)) % 4);
  let binary;
  try {
    binary = atob(padded);
  } catch (_) {
    throw new Error("cle_invalide");
  }
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToBase64Url(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new Error("octets_invalides");
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Une cle VAPID non compressee est un point P-256 non compresse : 65 octets
// commencant par 0x04. On refuse tout le reste plutot que de laisser le
// navigateur echouer avec un message opaque.
export function normalizeVapidKey(value) {
  let bytes = null;
  if (typeof value === "string") {
    try {
      bytes = base64UrlToBytes(value);
    } catch (_) {
      throw new Error("cle_vapid_invalide");
    }
  } else if (value instanceof Uint8Array) {
    bytes = value;
  }
  if (!bytes || bytes.length !== 65 || bytes[0] !== 0x04) {
    throw new Error("cle_vapid_invalide");
  }
  return bytes;
}

export function makeTestVapidKey(seed = 7) {
  const bytes = new Uint8Array(65);
  bytes[0] = 0x04;
  for (let i = 1; i < bytes.length; i++) {
    bytes[i] = (seed * 31 + i * 17) % 256;
  }
  return bytes;
}

export function vapidKeyToBase64Url(bytes) {
  return bytesToBase64Url(bytes);
}

export function maskEndpoint(endpoint) {
  const value = String(endpoint ?? "");
  if (!/^https:\/\/[^/\s]+/.test(value)) return "adresse inconnue";
  const host = value.match(/^https:\/\/([^/\s]+)/)[1];
  return `https://${host}/***`;
}

function keyBytesFromSubscription(subscription) {
  const p256dh = subscription?.getKey?.("p256dh");
  const auth = subscription?.getKey?.("auth");
  if (!p256dh || !auth) return null;
  return {
    p256dh: new Uint8Array(p256dh),
    auth: new Uint8Array(auth),
  };
}

// Convertit un PushSubscription en charge utile acceptee par la RPC
// `push_subscribe`. Les bornes sont celles de p52.
export function subscriptionPayload(subscription) {
  const endpoint = String(subscription?.endpoint ?? "").trim();
  if (endpoint.length < 20 || endpoint.length > 2000) {
    throw new Error("adresse_push_invalide");
  }
  if (!/^https:\/\/[^\s]+$/.test(endpoint)) {
    throw new Error("adresse_push_invalide");
  }
  const keys = keyBytesFromSubscription(subscription);
  if (!keys) throw new Error("cles_push_absentes");
  const p256dh = bytesToBase64Url(keys.p256dh);
  const auth = bytesToBase64Url(keys.auth);
  if (p256dh.length < 20 || p256dh.length > 200) {
    throw new Error("cle_push_invalide");
  }
  if (auth.length < 8 || auth.length > 200) {
    throw new Error("secret_push_invalide");
  }
  return { endpoint, p256dh, auth };
}

// Decide ce que l'interface doit proposer, sans jamais promettre un envoi.
export function permissionPlan({
  supported,
  secureContext,
  permission,
  hasKey,
  subscribed,
} = {}) {
  if (!supported) {
    return { action: "unsupported", message: "Ce navigateur ne gere pas les notifications." };
  }
  if (!secureContext) {
    return { action: "insecure", message: "Les notifications exigent une connexion securisee (https)." };
  }
  if (permission === "denied") {
    return { action: "blocked", message: "Notifications bloquees dans le navigateur." };
  }
  if (!hasKey) {
    return { action: "config_missing", message: "Notifications en attente de configuration." };
  }
  if (subscribed) {
    return { action: "disable", message: "Notifications activees sur cet appareil." };
  }
  if (permission === "granted") {
    return { action: "subscribe", message: "Touchez pour activer les notifications." };
  }
  return { action: "ask", message: "Touchez pour activer les notifications." };
}

export function normalizePreferences(rows) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row.kind !== "string") continue;
    map.set(row.kind, {
      inApp: row.in_app_enabled !== false,
      push: row.push_enabled !== false,
    });
  }
  return map;
}

export function pushAllowed(preferences, kind) {
  const map = preferences instanceof Map
    ? preferences
    : normalizePreferences(preferences);
  if (map.has(kind)) return map.get(kind).push;
  if (map.has("*")) return map.get("*").push;
  return true;
}

export function deliveryLabel(delivery, pushConfigured) {
  if (delivery === "in_app") {
    return pushConfigured
      ? "Notification enregistree. Envoi push en attente."
      : "Notification enregistree. Aucun canal push configure.";
  }
  if (delivery === "in_app+pending_push") {
    return "Notification enregistree. Envoi push en attente.";
  }
  return "Notification enregistree.";
}

export function isValidPushKind(kind) {
  return typeof kind === "string" && /^(\*|[a-z0-9_.-]{1,40})$/.test(kind);
}
