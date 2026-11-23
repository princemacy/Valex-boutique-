// VAlex - moderation publicitaire cote navigateur (p48).
//
// Lecture de `ad_campaigns` par RLS staff ; ecriture unique par
// `ad_moderate`. Le navigateur n'active rien : `ad_tick` place la file et
// choisit l'emplacement cote serveur.

import {
  CONFIRM_REJECT,
  assessAccess,
  canPreviewAd,
  formatCents,
  nextQueue,
  normalizeCampaigns,
  refundAmountCents,
  summarizeCampaigns,
  validateDecision,
} from "./ad-moderation-core.mjs";

const COLUMNS =
  "id,shop_id,slot_no,tier,duration_hours,price_cents,title,image_path,target_url,status,moderation_status,moderation_note,queue_seq,created_at,updated_at,starts_at,ends_at";

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
    const { error } = await sb.from("ad_campaigns").select("id").limit(1);
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
    access: assessAccess({ moduleAvailable, role, aal }),
  };
}

async function withShopNames(rows) {
  const list = normalizeCampaigns(rows);
  const ids = [...new Set(list.map((c) => c.shopId).filter(Boolean))];
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
  return list.map((c) => ({ ...c, shopName: byId[c.shopId] || null }));
}

export async function loadQueue({ limit = 100 } = {}) {
  const size = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 100;
  const { data, error } = await client()
    .from("ad_campaigns")
    .select(COLUMNS)
    .eq("status", "queued")
    .eq("moderation_status", "pending")
    .order("queue_seq", { ascending: true })
    .limit(size);
  if (error) return [];
  return nextQueue(await withShopNames(data));
}

export async function loadReviewed({ limit = 30 } = {}) {
  const size = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 30;
  const { data, error } = await client()
    .from("ad_campaigns")
    .select(COLUMNS)
    .in("moderation_status", ["approved", "rejected"])
    .order("updated_at", { ascending: false })
    .limit(size);
  if (error) return [];
  return withShopNames(data);
}

export async function moderate(campaignId, status, note = null) {
  const { data, error } = await client().rpc("ad_moderate", {
    p_campaign: campaignId,
    p_status: status,
    p_note: note ?? null,
  });
  if (error) throw new Error(errorText(error));
  return data;
}

export function errorText(error) {
  const m = String((error && error.message) || "");
  if (missingModule(error)) {
    return "La modération publicitaire n'est pas installée sur le serveur.";
  }
  if (/Verification en deux etapes requise/i.test(m)) {
    return "Double vérification requise : activez-la dans le QG avant de continuer.";
  }
  if (/Acces refuse/i.test(m)) {
    return "Accès refusé. Seul le propriétaire, un administrateur ou un modérateur peut agir.";
  }
  if (/Decision de moderation inconnue/i.test(m)) {
    return "Décision de modération inconnue.";
  }
  if (/Publicite introuvable/i.test(m)) {
    return "Cette publicité est introuvable.";
  }
  if (/deja terminee/i.test(m)) {
    return "Cette publicité est déjà terminée.";
  }
  if (/ne peut pas etre rejetee/i.test(m)) {
    return "Une publicité active ne peut pas être refusée.";
  }
  return m || "La décision publicitaire a échoué.";
}

const api = {
  CONFIRM_REJECT,
  loadAccess,
  loadQueue,
  loadReviewed,
  moderate,
  errorText,
  formatCents,
  assessAccess,
  canPreviewAd,
  formatCents,
  nextQueue,
  normalizeCampaigns,
  refundAmountCents,
  summarizeCampaigns,
  validateDecision,
};

if (typeof window !== "undefined") {
  window.VAlexAdModeration = api;
}

export default api;
