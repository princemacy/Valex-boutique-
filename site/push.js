// VAlex - client d'abonnement push PWA.
//
// Ce module ne s'abonne jamais tout seul : l'appel a `enable()` doit venir
// d'un geste de l'utilisateur. Aucun succes n'est annonce sans abonnement
// reel enregistre en base. Si la cle VAPID publique manque, le module le dit
// et ne fabrique rien.
//
// La cle VAPID publique est lue dans `app_settings` (lecture publique). La
// cle privee reste exclusivement dans les secrets du serveur d'envoi.

import {
  PUSH_WORKER_URL,
  isValidPushKind,
  maskEndpoint,
  normalizeVapidKey,
  permissionPlan,
  subscriptionPayload,
} from "./push-core.mjs";

const SETTINGS_KEY = "push_vapid_public_key";
const CLIENT_WAIT_MS = 10000;

export class PushError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "PushError";
    this.code = code;
  }
}

function browserSupported() {
  return typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window;
}

async function waitForClient() {
  const started = Date.now();
  while (Date.now() - started < CLIENT_WAIT_MS) {
    if (typeof window !== "undefined" && window.sb) return window.sb;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new PushError(
    "client_indisponible",
    "La connexion au site n'est pas encore prete. Reessayez.",
  );
}

async function readVapidKey(client) {
  const { data, error } = await client
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();
  if (error) throw new PushError("configuration_illisible", error.message);
  const value = typeof data?.value === "string" ? data.value.trim() : "";
  return value || null;
}

async function workerRegistration() {
  if (!browserSupported()) {
    throw new PushError("non_supporte", "Ce navigateur ne gere pas les notifications.");
  }
  const registration = await navigator.serviceWorker.register(PUSH_WORKER_URL, {
    scope: "/",
  });
  await navigator.serviceWorker.ready;
  return registration;
}

async function currentSubscription() {
  if (!browserSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return null;
  return await registration.pushManager.getSubscription();
}

async function requestPermission() {
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") {
    throw new PushError(
      "notifications_bloquees",
      "Les notifications sont bloquees dans le navigateur.",
    );
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new PushError(
      "notifications_refusees",
      "Les notifications n'ont pas ete autorisees.",
    );
  }
  return permission;
}

export async function state() {
  const supported = browserSupported();
  const secureContext = typeof window !== "undefined" && window.isSecureContext === true;
  const permission = supported ? Notification.permission : "unsupported";
  let configured = false;
  let subscribed = false;

  if (supported && secureContext) {
    try {
      const client = await waitForClient();
      configured = Boolean(await readVapidKey(client));
    } catch (_) {
      configured = false;
    }
    try {
      subscribed = Boolean(await currentSubscription());
    } catch (_) {
      subscribed = false;
    }
  }

  return {
    supported,
    secureContext,
    permission,
    configured,
    subscribed,
    plan: permissionPlan({ supported, secureContext, permission, hasKey: configured, subscribed }),
  };
}

export async function enable() {
  if (!browserSupported()) {
    throw new PushError("non_supporte", "Ce navigateur ne gere pas les notifications.");
  }
  if (window.isSecureContext !== true) {
    throw new PushError(
      "connexion_non_securisee",
      "Les notifications exigent une connexion securisee (https).",
    );
  }

  const client = await waitForClient();
  const keyValue = await readVapidKey(client);
  if (!keyValue) {
    throw new PushError(
      "configuration_absente",
      "Les notifications ne sont pas encore configurees. Reessayez plus tard.",
    );
  }

  let applicationServerKey;
  try {
    applicationServerKey = normalizeVapidKey(keyValue);
  } catch (_) {
    throw new PushError(
      "configuration_invalide",
      "La configuration des notifications est invalide.",
    );
  }

  await requestPermission();
  const registration = await workerRegistration();

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new PushError("abonnement_navigateur_refuse", message);
    }
  }

  const payload = subscriptionPayload(subscription);
  const { data, error } = await client.rpc("push_subscribe", {
    p_endpoint: payload.endpoint,
    p_p256dh: payload.p256dh,
    p_auth: payload.auth,
    p_user_agent: String(navigator.userAgent || "").slice(0, 300) || null,
  });
  if (error) {
    throw new PushError("enregistrement_refuse", error.message);
  }

  return { ok: true, id: data, endpoint: maskEndpoint(payload.endpoint) };
}

export async function disable() {
  const subscription = await currentSubscription();
  if (!subscription) return { ok: true, idempotent: true };

  const payload = subscriptionPayload(subscription);
  const client = await waitForClient();
  const { error } = await client.rpc("push_unsubscribe", {
    p_endpoint: payload.endpoint,
  });
  if (error) throw new PushError("desabonnement_refuse", error.message);

  await subscription.unsubscribe();
  return { ok: true, idempotent: false };
}

export async function list() {
  const client = await waitForClient();
  const { data, error } = await client.rpc("my_push_subscriptions");
  if (error) throw new PushError("lecture_refusee", error.message);
  return Array.isArray(data) ? data : [];
}

export async function preferences() {
  const client = await waitForClient();
  const { data, error } = await client.rpc("my_notification_preferences");
  if (error) throw new PushError("lecture_refusee", error.message);
  return Array.isArray(data) ? data : [];
}

export async function setPreference(kind, inApp, push) {
  if (!isValidPushKind(kind)) {
    throw new PushError("type_invalide", "Type de notification inconnu.");
  }
  const client = await waitForClient();
  const { error } = await client.rpc("notification_preference_set", {
    p_kind: kind,
    p_in_app: Boolean(inApp),
    p_push: Boolean(push),
  });
  if (error) throw new PushError("preference_refusee", error.message);
  return { ok: true };
}

const api = { state, enable, disable, list, preferences, setPreference, PushError };

if (typeof window !== "undefined") {
  window.VAlexPush = api;
  // L'enregistrement du service worker rend aussi la PWA installable. Il ne
  // demande aucune permission et n'abonne personne.
  if (browserSupported() && window.isSecureContext === true) {
    navigator.serviceWorker.register(PUSH_WORKER_URL, { scope: "/" }).catch(() => {});
  }
}

export default api;
