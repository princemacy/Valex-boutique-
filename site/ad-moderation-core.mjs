// VAlex - logique pure de la moderation publicitaire (p48).
// Aucune publicite n'est activee par le navigateur : `ad_moderate` decide,
// `ad_tick` place la file cote serveur.
//
// Un refus rend integralement le prix au portefeuille du vendeur. Cette
// consequence est affichee et exige le mot exact `REFUSER`.

import { formatCents, isSafeImagePath, isSafeInternalUrl } from "./ads-core.mjs";

export { formatCents };

export const MODERATION_ROLES = Object.freeze(["owner", "admin", "moderator"]);
export const DECISIONS = Object.freeze(["approved", "rejected"]);
export const QUEUE_MODERATION = "pending";
export const CONFIRM_REJECT = "REFUSER";

export const CAMPAIGN_STATUS_LABELS = Object.freeze({
  pending_payment: "Paiement en attente",
  queued: "En file",
  active: "Active",
  expired: "Expirée",
  cancelled: "Annulée",
  rejected: "Refusée",
});

export const MODERATION_LABELS = Object.freeze({
  pending: "À examiner",
  approved: "Approuvée",
  rejected: "Refusée",
});

export const TIER_LABELS = Object.freeze({
  standard: "Standard",
  premium: "Premium ×10",
});

export const DURATION_LABELS = Object.freeze({
  1: "1 heure",
  24: "24 heures",
  168: "7 jours",
  720: "30 jours",
  2160: "90 jours",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINAL_STATUSES = Object.freeze(["expired", "cancelled", "rejected"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value, max) {
  return String(value ?? "")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function uuid(value) {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

function cents(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}

function isoDate(value) {
  if (typeof value !== "string") return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function campaignStatusLabel(status) {
  return CAMPAIGN_STATUS_LABELS[status] || "Statut inconnu";
}

export function moderationLabel(status) {
  return MODERATION_LABELS[status] || "À examiner";
}

export function tierLabel(tier) {
  return TIER_LABELS[tier] || "Standard";
}

export function durationLabel(hours) {
  return DURATION_LABELS[hours] || `${hours} heures`;
}

export function isModerationRole(role) {
  return MODERATION_ROLES.includes(role);
}

export function normalizeCampaign(row) {
  if (!isPlainObject(row)) return null;
  const id = uuid(row.id);
  const shopId = uuid(row.shop_id ?? row.shopId);
  const title = cleanText(row.title, 120);
  if (!id || !shopId || !title) return null;
  const tier = Object.prototype.hasOwnProperty.call(TIER_LABELS, row.tier) ? row.tier : "standard";
  const status = Object.prototype.hasOwnProperty.call(CAMPAIGN_STATUS_LABELS, row.status)
    ? row.status
    : "pending_payment";
  const moderationStatus = Object.prototype.hasOwnProperty.call(MODERATION_LABELS, row.moderation_status)
    ? row.moderation_status
    : "pending";
  const imagePath = isSafeImagePath(row.image_path) ? cleanText(row.image_path, 300) : null;
  const targetUrl = isSafeInternalUrl(row.target_url)
    ? cleanText(row.target_url, 300)
    : null;
  return {
    id,
    shopId,
    shopName: cleanText(row.shopName ?? row.shop_name, 80) || null,
    tier,
    tierLabel: tierLabel(tier),
    title,
    imagePath,
    targetUrl,
    priceCents: cents(row.price_cents),
    priceLabel: formatCents(row.price_cents),
    durationHours: Number.isInteger(Number(row.duration_hours)) ? Number(row.duration_hours) : null,
    durationLabel: durationLabel(Number(row.duration_hours)),
    status,
    statusLabel: campaignStatusLabel(status),
    moderationStatus,
    moderationLabel: moderationLabel(moderationStatus),
    note: cleanText(row.moderation_note ?? row.moderationNote, 300) || null,
    queueSeq: Number.isSafeInteger(Number(row.queue_seq)) ? Number(row.queue_seq) : null,
    createdAt: isoDate(row.created_at ?? row.createdAt),
    updatedAt: isoDate(row.updated_at ?? row.updatedAt),
    startsAt: isoDate(row.starts_at ?? row.startsAt),
    endsAt: isoDate(row.ends_at ?? row.endsAt),
  };
}

export function normalizeCampaigns(rows) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const item = normalizeCampaign(row);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function nextQueue(rows) {
  const list = normalizeCampaigns(rows).filter((c) => c.moderationStatus === QUEUE_MODERATION);
  return list.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === "premium" ? -1 : 1;
    const aq = a.queueSeq ?? Number.MAX_SAFE_INTEGER;
    const bq = b.queueSeq ?? Number.MAX_SAFE_INTEGER;
    if (aq !== bq) return aq - bq;
    const at = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bt = b.createdAt ? Date.parse(b.createdAt) : 0;
    return at - bt;
  });
}

export function summarizeCampaigns(rows) {
  const list = normalizeCampaigns(rows);
  const count = (moderation) => list.filter((c) => c.moderationStatus === moderation).length;
  return {
    count: list.length,
    pending: count("pending"),
    approved: count("approved"),
    rejected: count("rejected"),
    premium: list.filter((c) => c.moderationStatus === "pending" && c.tier === "premium").length,
    valueCents: list
      .filter((c) => c.moderationStatus === "pending")
      .reduce((sum, c) => sum + c.priceCents, 0),
  };
}

export function assessAccess({ moduleAvailable, role, aal } = {}) {
  if (!moduleAvailable) {
    return {
      ok: false,
      reason: "module_absent",
      title: "La modération publicitaire n'est pas encore activée",
      message:
        "Les publicités ne sont pas installées sur le serveur. Aucune campagne n'est simulée.",
    };
  }
  if (!isModerationRole(role)) {
    return {
      ok: false,
      reason: "not_staff",
      title: "Accès réservé à l'équipe",
      message:
        "Seuls le propriétaire, un administrateur ou un modérateur peuvent examiner une publicité.",
    };
  }
  if (aal !== "aal2") {
    return {
      ok: false,
      reason: "mfa_required",
      title: "Double vérification requise",
      message:
        "Le serveur exige aal2 pour modérer une publicité. Activez la double vérification dans le QG.",
    };
  }
  return {
    ok: true,
    reason: "ready",
    title: "Modération publicitaire",
    message:
      "Approuver place la campagne dans la file ; le serveur choisit l'emplacement. Refuser rend integralement le prix au vendeur et exige le mot REFUSER.",
  };
}

export function isRefundable(campaign) {
  return Boolean(
    campaign &&
      campaign.moderationStatus === "pending" &&
      !FINAL_STATUSES.includes(campaign.status) &&
      campaign.status !== "active" &&
      campaign.status !== "pending_payment" &&
      campaign.priceCents > 0,
  );
}

export function refundAmountCents(campaign) {
  return isRefundable(campaign) ? campaign.priceCents : 0;
}

export function validateDecision({ campaign, status, note, confirm } = {}) {
  if (!campaign) return { ok: false, error: "Publicité introuvable." };
  if (!DECISIONS.includes(status)) return { ok: false, error: "Décision inconnue." };
  if (FINAL_STATUSES.includes(campaign.status)) {
    return { ok: false, error: "Cette publicité est déjà terminée." };
  }
  if (campaign.moderationStatus === status) {
    return {
      ok: false,
      error:
        status === "approved"
          ? "Cette publicité est déjà approuvée."
          : "Cette publicité est déjà refusée.",
    };
  }
  if (status === "rejected" && campaign.status === "active") {
    return {
      ok: false,
      error: "Une publicité active ne peut pas être refusée. Attendez la fin ou passez par un arbitrage.",
    };
  }
  const clean = cleanText(note, 300);
  if (status === "rejected") {
    if (clean.length < 5) {
      return { ok: false, error: "Écrivez le motif du refus (5 caractères minimum)." };
    }
    if (String(confirm ?? "").trim() !== CONFIRM_REJECT) {
      return {
        ok: false,
        error: `Tapez exactement ${CONFIRM_REJECT} pour confirmer le remboursement intégral.`,
      };
    }
    if (campaign.status === "pending_payment") {
      return { ok: false, error: "Aucun paiement reçu : cette campagne ne peut pas être remboursée." };
    }
  }
  return { ok: true, status, note: clean || null };
}

export function canPreviewAd(campaign) {
  return Boolean(campaign && campaign.imagePath && isSafeImagePath(campaign.imagePath));
}

export function isExternalImage(campaign) {
  return Boolean(campaign && campaign.imagePath && /^https:\/\//i.test(campaign.imagePath));
}
