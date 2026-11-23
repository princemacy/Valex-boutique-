// VAlex - console de moderation des medias (p50, staff + aal2).
//
// Lecture de `media_assets` par RLS, ecriture uniquement par
// `storage_review`. Le navigateur ne supprime aucun fichier : le serveur
// marque le media, rend son quota et journalise l'action.

import {
  QUEUE_STATUSES,
  assessModerationAccess,
  canPreview,
  formatBytes,
  isModerationRole,
  mediaStatusLabel,
  nextQueue,
  normalizeMediaList,
  reviewActionLabel,
  summarizeMedia,
  validateReview,
} from "./moderation-core.mjs";

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

async function authAal() {
  const auth = client().auth;
  if (!auth || !auth.mfa || typeof auth.mfa.getAuthenticatorAssuranceLevel !== "function") {
    return null;
  }
  try {
    const { data, error } = await auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return null;
    return data.currentLevel === "aal2" ? "aal2" : data.currentLevel === "aal1" ? "aal1" : null;
  } catch (_) {
    return null;
  }
}

export async function loadAccess() {
  const sb = client();
  let moduleAvailable = false;
  try {
    const { error } = await sb.from("media_assets").select("id").limit(1);
    moduleAvailable = !error || !missingModule(error);
  } catch (_) {
    moduleAvailable = false;
  }

  let aal = null;
  try {
    const { data, error } = await sb.rpc("current_aal");
    if (!error && (data === "aal1" || data === "aal2")) aal = data;
  } catch (_) {
    aal = null;
  }
  if (!aal) aal = await authAal();

  let role = null;
  try {
    const { data, error } = await sb.rpc("current_staff_role");
    if (!error && typeof data === "string") role = data;
  } catch (_) {
    role = null;
  }
  if (!role) {
    try {
      const { data, error } = await sb.rpc("is_admin");
      if (!error && data === true) role = "admin";
    } catch (_) {
      role = null;
    }
  }

  return {
    moduleAvailable,
    role,
    aal,
    access: assessModerationAccess({ moduleAvailable, role, aal }),
  };
}

const MEDIA_COLUMNS =
  "id,shop_id,product_id,bucket,storage_path,mime,bytes,kind,status,review_note,created_at,reviewed_at";

async function withShopNames(rows) {
  const list = normalizeMediaList(rows);
  const ids = [...new Set(list.map((m) => m.shopId).filter(Boolean))];
  if (!ids.length) return list;
  let shops = [];
  try {
    const { data, error } = await client().from("shops").select("id,name").in("id", ids);
    if (!error) shops = data || [];
  } catch (_) {
    shops = [];
  }
  const byId = {};
  for (const shop of shops) {
    if (shop && shop.id) byId[shop.id] = shop.name;
  }
  return list.map((m) => ({ ...m, shopName: byId[m.shopId] || null }));
}

export async function loadQueue({ limit = 100 } = {}) {
  const size = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 100;
  const { data, error } = await client()
    .from("media_assets")
    .select(MEDIA_COLUMNS)
    .in("status", [...QUEUE_STATUSES])
    .order("created_at", { ascending: true })
    .limit(size);
  if (error) return [];
  return nextQueue(await withShopNames(data));
}

export async function loadReviewed({ limit = 30 } = {}) {
  const size = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 30;
  const { data, error } = await client()
    .from("media_assets")
    .select(MEDIA_COLUMNS)
    .in("status", ["approved", "rejected"])
    .order("reviewed_at", { ascending: false })
    .limit(size);
  if (error) return [];
  return withShopNames(data);
}

export async function reviewMedia({ assetId, status, note }) {
  const { data, error } = await client().rpc("storage_review", {
    p_asset: assetId,
    p_status: status,
    p_note: note ?? null,
  });
  if (error) throw new Error(errorText(error));
  return data;
}

export function errorText(error) {
  const m = String((error && error.message) || "");
  if (missingModule(error)) {
    return "La modération des médias n'est pas installée sur le serveur.";
  }
  if (/Verification en deux etapes requise/i.test(m)) {
    return "Double vérification requise : activez-la dans le QG avant de continuer.";
  }
  if (/Acces refuse/i.test(m)) {
    return "Accès refusé. Seul le propriétaire, un administrateur ou un modérateur peut agir.";
  }
  if (/Statut de moderation inconnu/i.test(m)) {
    return "Décision de modération inconnue.";
  }
  if (/deja retire/i.test(m)) {
    return "Ce média est déjà retiré.";
  }
  if (/Media introuvable/i.test(m)) {
    return "Ce média est introuvable.";
  }
  return m || "La décision de modération a échoué.";
}

export {
  QUEUE_STATUSES,
  assessModerationAccess,
  canPreview,
  formatBytes,
  isModerationRole,
  mediaStatusLabel,
  nextQueue,
  normalizeMediaList,
  reviewActionLabel,
  summarizeMedia,
  validateReview,
} from "./moderation-core.mjs";

const api = {
  loadAccess,
  loadQueue,
  loadReviewed,
  reviewMedia,
  errorText,
  formatBytes,
  mediaStatusLabel,
  reviewActionLabel,
  summarizeMedia,
  canPreview,
};

if (typeof window !== "undefined") {
  window.VAlexModeration = api;
}

export default api;
