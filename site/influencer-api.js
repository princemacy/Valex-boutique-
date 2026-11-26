// VAlex — accès API du programme partenaire.
// Les RPC et Edge Functions listés dans docs/influencer-api-contract.md sont à créer.
// Aucune lecture directe de tables, clé secrète ou confirmation optimiste.
import {
  createIdempotencyKey,
  normalizeActivityLog,
  normalizeDashboard,
  normalizeInvitations,
  normalizePartnerShops,
  normalizePermissions,
  validateInviteEmail,
  validatePermissionPatch,
} from "./influencer-core.mjs";

export class InfluencerApiError extends Error {
  constructor(message, { code = "influencer_api_error", missing = false } = {}) {
    super(message);
    this.name = "InfluencerApiError";
    this.code = code;
    this.missing = missing;
    this.userMessage = missing
      ? "Le programme partenaire n’est pas encore activé sur le serveur. Aucune action n’a été effectuée."
      : "L’opération n’a pas abouti. Vérifiez votre connexion puis réessayez.";
  }
}

function client() {
  if (typeof window === "undefined" || !window.sb) {
    throw new InfluencerApiError("client_indisponible", { code: "client_indisponible" });
  }
  return window.sb;
}

function isMissing(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return ["42883", "42P01", "PGRST202", "PGRST204"].includes(code) ||
    message.includes("could not find the function") ||
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("not found");
}

function apiError(error) {
  return new InfluencerApiError(String(error?.message || "backend_refuse"), {
    code: isMissing(error) ? "backend_unavailable" : String(error?.code || "influencer_api_error"),
    missing: isMissing(error),
  });
}

async function invokeEdge(name, body) {
  const { data, error } = await client().functions.invoke(name, { body });
  if (error) throw apiError(error);
  if (!data || data.ok !== true) {
    // Réponse incomplète = jamais d'annonce de réussite.
    throw new InfluencerApiError("reponse_backend_invalide", { code: "reponse_backend_invalide" });
  }
  return data;
}

async function callRpc(name, args = {}) {
  const { data, error } = await client().rpc(name, args);
  if (error) throw apiError(error);
  return data;
}

// Pour la protection UX contre les doubles clics dans un même onglet.
// L'idempotence réelle doit aussi être appliquée côté serveur.
const pendingInvites = new Map();

export async function sendInvitation(email) {
  const cleanEmail = validateInviteEmail(email);
  const existing = pendingInvites.get(cleanEmail);
  if (existing) return existing;
  const request = invokeEdge("valex-influencer-invites", {
    action: "send",
    email: cleanEmail,
    idempotency_key: createIdempotencyKey("invite"),
  }).finally(() => pendingInvites.delete(cleanEmail));
  pendingInvites.set(cleanEmail, request);
  return request;
}

export async function resendInvitation(invitationId) {
  if (!String(invitationId || "").trim()) throw new InfluencerApiError("invitation_invalide", { code: "invitation_invalide" });
  return invokeEdge("valex-influencer-invites", {
    action: "resend",
    invitation_id: String(invitationId).trim(),
    idempotency_key: createIdempotencyKey("resend"),
  });
}

export async function cancelInvitation(invitationId) {
  if (!String(invitationId || "").trim()) throw new InfluencerApiError("invitation_invalide", { code: "invitation_invalide" });
  return invokeEdge("valex-influencer-invites", {
    action: "cancel",
    invitation_id: String(invitationId).trim(),
    idempotency_key: createIdempotencyKey("cancel"),
  });
}

export async function verifyInvitation(token) {
  const cleanToken = String(token ?? "").trim();
  if (!cleanToken) throw new InfluencerApiError("invitation_invalide", { code: "invitation_invalide" });
  // Le token est transmis en POST, jamais en query string, URL de navigation ou journal client.
  return invokeEdge("valex-influencer-invitation", { action: "verify", token: cleanToken });
}

export async function acceptInvitation(token, { charterVersion, charterAccepted } = {}) {
  const cleanToken = String(token ?? "").trim();
  if (!cleanToken || !charterAccepted || !String(charterVersion ?? "").trim()) {
    throw new InfluencerApiError("acceptation_incomplete", { code: "acceptation_incomplete" });
  }
  // Ne crée pas de compte Auth et ne reçoit aucun mot de passe.
  return invokeEdge("valex-influencer-invitation", {
    action: "accept",
    token: cleanToken,
    charter_version: String(charterVersion).trim(),
    charter_accepted: true,
  });
}

export async function loadDashboard() {
  return normalizeDashboard(await callRpc("influencer_dashboard"));
}

export async function loadInvitations({ limit = 50 } = {}) {
  const size = Number.isInteger(limit) ? Math.min(100, Math.max(1, limit)) : 50;
  return normalizeInvitations(await callRpc("influencer_invitations", { p_limit: size }));
}

export async function loadAccompaniedShops({ limit = 50 } = {}) {
  const size = Number.isInteger(limit) ? Math.min(100, Math.max(1, limit)) : 50;
  return normalizePartnerShops(await callRpc("influencer_shops", { p_limit: size }));
}

export async function loadShopPermissions(shopId) {
  if (!shopId) throw new InfluencerApiError("boutique_invalide", { code: "boutique_invalide" });
  return normalizePermissions(await callRpc("influencer_shop_permissions", { p_shop: shopId }));
}

export async function updateShopPermissions(shopId, patch) {
  if (!shopId) throw new InfluencerApiError("boutique_invalide", { code: "boutique_invalide" });
  const permissions = validatePermissionPatch(patch);
  return callRpc("merchant_update_influencer_permissions", {
    p_shop: shopId,
    p_permissions: permissions,
  });
}

export async function revokeShopDelegation(shopId, confirmation) {
  if (!shopId || confirmation !== true) {
    throw new InfluencerApiError("confirmation_requise", { code: "confirmation_requise" });
  }
  return callRpc("merchant_revoke_influencer_access", { p_shop: shopId });
}

export async function loadShopActivity(shopId, { limit = 50 } = {}) {
  if (!shopId) throw new InfluencerApiError("boutique_invalide", { code: "boutique_invalide" });
  const size = Number.isInteger(limit) ? Math.min(100, Math.max(1, limit)) : 50;
  return normalizeActivityLog(await callRpc("delegated_shop_activity", {
    p_shop: shopId,
    p_limit: size,
  }));
}

export async function loadMerchantDelegations({ limit = 50 } = {}) {
  const size = Number.isInteger(limit) ? Math.min(100, Math.max(1, limit)) : 50;
  return callRpc("merchant_influencer_delegations", { p_limit: size });
}

const api = {
  sendInvitation,
  resendInvitation,
  cancelInvitation,
  verifyInvitation,
  acceptInvitation,
  loadDashboard,
  loadInvitations,
  loadAccompaniedShops,
  loadShopPermissions,
  updateShopPermissions,
  revokeShopDelegation,
  loadShopActivity,
  loadMerchantDelegations,
};

if (typeof window !== "undefined") window.VAlexInfluencer = api;
export default api;
