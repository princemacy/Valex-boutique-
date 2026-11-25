// VAlex - logique pure des publicites.
// Aucun acces reseau, aucun contenu invente.
//
// Regles du contrat public :
//   - seules les campagnes payantes reellement actives et approuvees sont
//     affichees, avec le nom reel de la boutique ;
//   - aucun emplacement VAlex, aucun titre de remplacement, aucune annonce
//     fabriquee a partir d'un emplacement vide ;
//   - le prix affiche est un apercu : le serveur recalcule toujours.

export const AD_SLOT_COUNT = 10;
export const VALEX_SLOTS = Object.freeze([1, 2]);
export const PAID_SLOTS = Object.freeze([3, 4, 5, 6, 7, 8, 9, 10]);
export const AD_TIERS = Object.freeze(["standard", "premium"]);
export const AD_DURATIONS = Object.freeze([1, 24, 168, 720, 2160]);

// Doit rester identique a `public.ad_price` (p48).
export const AD_BASE_PRICE_CENTS = Object.freeze({
  1: 5000,
  24: 100000,
  168: 500000,
  720: 1500000,
  2160: 3500000,
});

const MAX_TITLE = 120;
const MAX_URL = 300;
const MAX_IMAGE = 300;

function cleanText(value, max) {
  return String(value ?? "")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function adPriceCents(tier, hours) {
  if (!AD_TIERS.includes(tier)) {
    throw new Error("niveau_publicite_inconnu");
  }
  if (typeof hours !== "number" || !Number.isInteger(hours) || !AD_DURATIONS.includes(hours)) {
    throw new Error("duree_publicite_inconnue");
  }
  const base = AD_BASE_PRICE_CENTS[hours];
  return tier === "premium" ? base * 10 : base;
}

export function isSafeInternalUrl(value) {
  const url = String(value ?? "").trim();
  return url.length > 0 &&
    url.length <= MAX_URL &&
    !url.startsWith("//") &&
    /^\/[^\s]*$/.test(url);
}

export function isSafeImagePath(value) {
  const path = String(value ?? "").trim();
  if (!path || path.length > MAX_IMAGE) return false;
  if (/^https:\/\//i.test(path)) return true;
  const match = path.match(/^([a-z0-9-]+)\/(.+)$/);
  if (!match || !["product-images", "shop-logos"].includes(match[1])) {
    return false;
  }
  return /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(match[2]) &&
    !path.includes("..");
}

function normalizeRow(row) {
  if (!row || typeof row !== "object") return null;
  const slotNo = Number(row.slot_no);
  // Seuls les emplacements payants 3 a 10 existent cote public.
  if (!Number.isInteger(slotNo) || slotNo < 3 || slotNo > AD_SLOT_COUNT) {
    return null;
  }
  if (row.kind !== "paid") return null;

  const title = cleanText(row.title, MAX_TITLE);
  if (!title) return null;
  const shopName = cleanText(row.shop_name, 120);
  // Une campagne sans boutique reelle n'est pas affichable.
  if (!shopName) return null;
  const targetUrl = isSafeInternalUrl(row.target_url)
    ? cleanText(row.target_url, MAX_URL)
    : null;
  const imagePath = isSafeImagePath(row.image_path)
    ? cleanText(row.image_path, MAX_IMAGE)
    : null;

  const tier = AD_TIERS.includes(row.tier) ? row.tier : null;
  if (!tier) return null;
  const remaining = Number(row.remaining_seconds);
  return {
    slotNo,
    kind: "paid",
    active: true,
    title,
    shopName,
    targetUrl,
    imagePath,
    tier,
    remainingSeconds: Number.isFinite(remaining) && remaining >= 0
      ? Math.floor(remaining)
      : null,
  };
}

// Transforme les lignes de `ad_home` en emplacements payants deterministes.
// Les doublons et les lignes incoherentes sont ignores, pas corriges.
export function normalizeAdRows(rows) {
  const bySlot = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const slot = normalizeRow(row);
    if (!slot || bySlot.has(slot.slotNo)) continue;
    bySlot.set(slot.slotNo, slot);
  }
  return Array.from(bySlot.values()).sort((a, b) => a.slotNo - b.slotNo);
}

// Prepare l'affichage : uniquement les annonces payantes actives.
// Aucun emplacement vide n'est rendu et aucune annonce n'est inventee.
export function buildAdDisplay(rows) {
  const paid = normalizeAdRows(rows);
  return {
    paid,
    filled: paid.length,
    total: AD_SLOT_COUNT,
  };
}

export function remainingLabel(seconds) {
  if (seconds == null || seconds === "") return "";
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return "";
  if (value === 0) return "Termine";
  if (value < 3600) return `${Math.max(1, Math.ceil(value / 60))} min`;
  if (value < 86400) return `${Math.ceil(value / 3600)} h`;
  return `${Math.ceil(value / 86400)} j`;
}

// Valide une demande d'achat cote client. Le serveur reste seul juge du
// prix, de la file et de la moderation.
export function validateCampaignInput({
  tier,
  hours,
  title,
  targetUrl,
  imagePath,
} = {}) {
  if (!AD_TIERS.includes(tier)) throw new Error("niveau_publicite_inconnu");
  if (typeof hours !== "number" || !Number.isInteger(hours) || !AD_DURATIONS.includes(hours)) {
    throw new Error("duree_publicite_inconnue");
  }
  const cleanTitle = cleanText(title, MAX_TITLE);
  if (cleanTitle.length < 3) throw new Error("titre_publicite_trop_court");
  const url = String(targetUrl ?? "").trim();
  if (url && !isSafeInternalUrl(url)) throw new Error("lien_publicite_invalide");
  const image = String(imagePath ?? "").trim();
  if (!image) throw new Error("image_publicite_requise");
  if (!isSafeImagePath(image)) {
    throw new Error("image_publicite_invalide");
  }
  return {
    tier,
    hours,
    title: cleanTitle,
    targetUrl: url || null,
    imagePath: image,
    priceCents: adPriceCents(tier, hours),
  };
}

export function formatCents(cents) {
  const value = Number(cents);
  if (!Number.isFinite(value) || value < 0) return "—";
  return `${Math.floor(value / 100)},${String(value % 100).padStart(2, "0")} GDS`;
}

// Durees proposees, dans l'ordre lisible pour un vendeur.
export const AD_DURATION_LABELS = Object.freeze({
  1: "1 heure",
  24: "24 heures",
  168: "7 jours",
  720: "30 jours",
  2160: "90 jours",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildIdempotencyKey(value) {
  const raw = String(value ?? "").replace(/[^A-Za-z0-9-]/g, "");
  if (raw.length < 8) throw new Error("cle_idempotence_invalide");
  return raw.slice(0, 64);
}

export function newIdempotencyKey() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return "ad-" + cryptoApi.randomUUID();
  }
  throw new Error("aleatoire_indisponible");
}

// Prepare les arguments exacts de `ad_purchase` (p48). Le serveur reste seul
// juge du prix, de la file et de la moderation.
export function buildPurchaseParams({
  shopId,
  tier,
  hours,
  title,
  targetUrl,
  imagePath,
  idempotencyKey,
} = {}) {
  const clean = validateCampaignInput({ tier, hours, title, targetUrl, imagePath });
  if (typeof shopId !== "string" || !UUID_RE.test(shopId)) {
    throw new Error("boutique_invalide");
  }
  return {
    p_shop: shopId,
    p_tier: clean.tier,
    p_duration_hours: clean.hours,
    p_title: clean.title,
    p_image_path: clean.imagePath,
    p_target_url: clean.targetUrl,
    p_idempotency_key: buildIdempotencyKey(idempotencyKey),
  };
}
