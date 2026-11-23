// VAlex - preferences de notification cote navigateur (p52).
//
// Lecture par `my_notification_preferences`, ecriture par
// `notification_preference_set`. Aucune autre table, aucune autre RPC.
// Aucun reglage n'est applique localement sans confirmation du serveur.
import {
  assessAccess,
  effective,
  globalPreference,
  normalizePreferencesMap,
  rowsFor,
  summarize,
  toggle,
  validateToggle,
} from "./notification-prefs-core.mjs";

function client() {
  if (typeof window === "undefined" || !window.sb) {
    throw new Error("client_indisponible");
  }
  return window.sb;
}

function missingModule(error) {
  const code = String((error && error.code) || "");
  const m = String((error && error.message) || "").toLowerCase();
  return (
    code === "42P01" ||
    code === "42883" ||
    code === "PGRST202" ||
    m.includes("does not exist") ||
    m.includes("could not find the function") ||
    m.includes("schema cache")
  );
}

async function signedIn() {
  const auth = client().auth;
  if (!auth) return false;
  try {
    if (typeof auth.getUser === "function") {
      const { data } = await auth.getUser();
      if (data && data.user && data.user.id) return true;
    }
    if (typeof auth.getSession === "function") {
      const { data } = await auth.getSession();
      if (data && data.session && data.session.user) return true;
    }
  } catch (_) {
    return false;
  }
  return false;
}

export async function loadAccess() {
  const isSignedIn = await signedIn();
  let moduleAvailable = false;
  if (isSignedIn) {
    try {
      const { error } = await client().rpc("my_notification_preferences");
      moduleAvailable = !error || !missingModule(error);
    } catch (_) {
      moduleAvailable = false;
    }
  }
  return {
    signedIn: isSignedIn,
    moduleAvailable,
    access: assessAccess({ signedIn: isSignedIn, moduleAvailable }),
  };
}

export async function load() {
  const { data, error } = await client().rpc("my_notification_preferences");
  if (error) throw new Error(errorText(error));
  return normalizePreferencesMap(data);
}

export async function set(kind, inApp, push) {
  const guard = validateToggle({ kind, field: "inApp" });
  if (!guard.ok) throw new Error(guard.error);
  const { error } = await client().rpc("notification_preference_set", {
    p_kind: kind,
    p_in_app: Boolean(inApp),
    p_push: Boolean(push),
  });
  if (error) throw new Error(errorText(error));
  return true;
}

export function errorText(error) {
  const m = String((error && error.message) || "");
  if (missingModule(error)) {
    return "Les préférences de notification ne sont pas installées sur le serveur.";
  }
  if (/Connectez-vous/i.test(m)) {
    return "Connectez-vous pour régler vos notifications.";
  }
  if (/Type de notification inconnu/i.test(m)) {
    return "Type de notification inconnu.";
  }
  return m || "Le réglage des notifications a échoué.";
}

export {
  assessAccess,
  effective,
  globalPreference,
  normalizePreferencesMap,
  rowsFor,
  summarize,
  toggle,
  validateToggle,
};

const api = {
  loadAccess,
  load,
  set,
  errorText,
  effective,
  globalPreference,
  normalizePreferencesMap,
  rowsFor,
  summarize,
  toggle,
  validateToggle,
};

if (typeof window !== "undefined") {
  window.VAlexNotificationPrefs = api;
}

export default api;
