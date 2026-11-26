// VAlex — logique pure du programme partenaire.
// Aucun accès réseau, calcul financier, valeur de démonstration ou autorisation locale.
// Toute autorisation est vérifiée à nouveau par le backend.

export const OPTIONAL_PERMISSIONS = Object.freeze([
  "stock_manage",
  "prices_manage",
  "orders_manage",
  "delivery_manage",
  "messages_reply",
]);

export const BASE_CAPABILITIES = Object.freeze([
  "products_create",
  "products_edit",
  "products_publish",
  "ai_assist",
  "referral_tools",
]);

// Les permissions de paiement, portefeuille, identité, propriété et administration
// sont intentionnellement exclues de ce contrat client.
const INVITATION_STATUSES = Object.freeze({
  pending: "En attente",
  accepted: "Acceptée",
  expired: "Expirée",
  cancelled: "Annulée",
  send_error: "En erreur d’envoi",
});

const SHOP_STATUSES = Object.freeze({
  preparing: "En préparation",
  pending: "En attente de validation",
  approved: "Approuvée",
  suspended: "Suspendue",
  rejected: "Refusée",
});

const ACTIVITY_LABELS = Object.freeze({
  product_created: "Produit créé",
  product_updated: "Produit modifié",
  product_deleted: "Produit supprimé",
  stock_changed: "Stock modifié",
  price_changed: "Prix modifié",
  order_managed: "Commande gérée",
  delivery_changed: "Livraison modifiée",
  message_sent: "Message envoyé",
  permission_changed: "Permission modifiée",
  access_revoked: "Accès révoqué",
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TEXT = 240;

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value, max = MAX_TEXT) {
  return String(value ?? "").replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function validDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

export function validateInviteEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) throw new Error("email_invitation_invalide");
  return email;
}

export function invitationStatusLabel(status) {
  return INVITATION_STATUSES[status] || "Statut inconnu";
}

export function normalizeInvitation(row) {
  if (!plainObject(row)) return null;
  const id = cleanText(row.id, 80);
  const status = Object.hasOwn(INVITATION_STATUSES, row.status) ? row.status : null;
  if (!id || !status) return null;
  return {
    id,
    email: cleanText(row.email, 254).toLowerCase() || null,
    status,
    statusLabel: invitationStatusLabel(status),
    createdAt: validDate(row.created_at),
    expiresAt: validDate(row.expires_at),
    acceptedAt: validDate(row.accepted_at),
    // Les jetons et URLs d'invitation ne sont jamais normalisés ni retournés.
  };
}

export function normalizeInvitations(rows) {
  const seen = new Set();
  const result = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const item = normalizeInvitation(row);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function count(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function moneyMetric(value) {
  if (!plainObject(value)) return null;
  const amountCents = Number(value.amount_cents);
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) return null;
  const currency = cleanText(value.currency, 8);
  if (!currency) return null;
  return { amountCents, currency };
}

// Cette fonction ne fait que valider les valeurs calculées et renvoyées côté serveur.
// Valeur manquante ou invalide => null, jamais un total fabriqué ou calculé ici.
export function normalizeDashboard(payload) {
  if (!plainObject(payload)) return null;
  const counts = plainObject(payload.counts) ? payload.counts : {};
  const commissions = plainObject(payload.commissions) ? payload.commissions : {};
  return {
    counts: {
      invitationsSent: count(counts.invitations_sent),
      invitationsAccepted: count(counts.invitations_accepted),
      shopsPreparing: count(counts.shops_preparing),
      shopsApproved: count(counts.shops_approved),
      shopsSuspended: count(counts.shops_suspended),
      eligibleSales: count(counts.eligible_sales),
    },
    commissions: {
      pending: moneyMetric(commissions.pending),
      available: moneyMetric(commissions.available),
    },
    publicName: cleanText(payload.public_name, 80) || null,
    programStatus: cleanText(payload.program_status, 40) || null,
  };
}

export function shopStatusLabel(status) {
  return SHOP_STATUSES[status] || "Statut inconnu";
}

export function normalizePartnerShop(row) {
  if (!plainObject(row)) return null;
  const id = typeof row.id === "string" && UUID_RE.test(row.id) ? row.id : null;
  const status = Object.hasOwn(SHOP_STATUSES, row.status) ? row.status : null;
  if (!id || !status) return null;
  return {
    id,
    name: cleanText(row.name, 120) || "Boutique sans nom",
    status,
    statusLabel: shopStatusLabel(status),
    launchedAt: validDate(row.launched_at),
    productCount: count(row.product_count),
    activity: cleanText(row.activity, 240) || null,
    delegationActive: typeof row.delegation_active === "boolean" ? row.delegation_active : null,
    commissions: {
      pending: moneyMetric(row.commissions?.pending),
      available: moneyMetric(row.commissions?.available),
    },
    publicBadgeVisible: typeof row.public_badge_visible === "boolean" ? row.public_badge_visible : null,
  };
}

export function normalizePartnerShops(rows) {
  const seen = new Set();
  const result = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const shop = normalizePartnerShop(row);
    if (!shop || seen.has(shop.id)) continue;
    seen.add(shop.id);
    result.push(shop);
  }
  return result;
}

export function normalizePermissions(payload) {
  if (!plainObject(payload)) return null;
  const base = plainObject(payload.base) ? payload.base : {};
  const optional = plainObject(payload.optional) ? payload.optional : {};
  return {
    base: Object.fromEntries(BASE_CAPABILITIES.map((key) => [key, base[key] === true])),
    optional: Object.fromEntries(OPTIONAL_PERMISSIONS.map((key) => [
      key,
      typeof optional[key] === "boolean" ? optional[key] : null,
    ])),
    delegationActive: typeof payload.delegation_active === "boolean" ? payload.delegation_active : null,
    lastActivityAt: validDate(payload.last_activity_at),
    publicName: cleanText(payload.influencer_public_name, 80) || null,
  };
}

// Accepte exclusivement des changements explicites de permissions facultatives.
export function validatePermissionPatch(patch) {
  if (!plainObject(patch)) throw new Error("permissions_invalides");
  const keys = Object.keys(patch);
  if (!keys.length || keys.some((key) => !OPTIONAL_PERMISSIONS.includes(key))) {
    throw new Error("permission_interdite");
  }
  if (keys.some((key) => typeof patch[key] !== "boolean")) {
    throw new Error("permissions_invalides");
  }
  return Object.fromEntries(keys.map((key) => [key, patch[key]]));
}

export function activityLabel(kind) {
  return ACTIVITY_LABELS[kind] || "Action de boutique";
}

export function normalizeActivity(row) {
  if (!plainObject(row)) return null;
  const id = cleanText(row.id, 80);
  const kind = Object.hasOwn(ACTIVITY_LABELS, row.kind) ? row.kind : null;
  if (!id || !kind) return null;
  return {
    id,
    kind,
    label: activityLabel(kind),
    createdAt: validDate(row.created_at),
    // Limité à un libellé déjà filtré par le backend; pas de contenu privé ni données financières.
    summary: cleanText(row.summary, 240) || null,
  };
}

export function normalizeActivityLog(rows) {
  const seen = new Set();
  const result = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const item = normalizeActivity(row);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

export function canRetryInvitation(invitation) {
  return Boolean(invitation && ["pending", "send_error"].includes(invitation.status));
}

export function canCancelInvitation(invitation) {
  return Boolean(invitation && invitation.status === "pending");
}

export function createIdempotencyKey(prefix = "influencer") {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi || typeof cryptoApi.randomUUID !== "function") {
    throw new Error("aleatoire_indisponible");
  }
  return `${prefix}-${cryptoApi.randomUUID()}`;
}
