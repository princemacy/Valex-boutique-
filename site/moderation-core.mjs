// VAlex - logique pure de la moderation des medias (p50, staff + MFA).
// Aucune suppression de fichier n'est declenchee par le navigateur : le
// serveur marque le media et rend son quota.

export const MEDIA_STATUS_LABELS = Object.freeze({
  pending: "En attente",
  approved: "Approuvé",
  quarantined: "En quarantaine",
  rejected: "Refusé",
  deleted: "Retiré",
});

export const KIND_LABELS = Object.freeze({
  image: "Image",
  video: "Vidéo",
  doc: "Document",
});

export const REVIEW_STATUSES = Object.freeze(["approved", "quarantined", "rejected"]);
export const MODERATION_ROLES = Object.freeze(["owner", "admin", "moderator"]);
export const QUEUE_STATUSES = Object.freeze(["pending", "quarantined"]);
export const BUCKET_LABELS = Object.freeze({
  "product-images": "Photo produit",
  "product-videos": "Vidéo produit",
  "shop-logos": "Logo de boutique",
  "relay-photos": "Photo relais",
  "id-docs": "Pièce d'identité",
  "courier-docs": "Document livreur",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function bytes(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}

function isoDate(value) {
  if (typeof value !== "string") return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function mediaStatusLabel(status) {
  return MEDIA_STATUS_LABELS[status] || "Statut inconnu";
}

export function kindLabel(kind) {
  return KIND_LABELS[kind] || "Média";
}

export function bucketLabel(bucket) {
  return BUCKET_LABELS[bucket] || cleanText(bucket, 40) || "Média";
}

export function formatBytes(value) {
  const n = bytes(value);
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0).replace(".", ",")} Ko`;
  const mo = n / (1024 * 1024);
  return `${mo.toFixed(mo < 10 ? 1 : 0).replace(".", ",")} Mo`;
}

export function isModerationRole(role) {
  return MODERATION_ROLES.includes(role);
}

export function normalizeMedia(row) {
  if (!isPlainObject(row)) return null;
  const id = uuid(row.id);
  const path = cleanText(row.storage_path ?? row.storagePath ?? row.path, 500);
  if (!id || !path) return null;
  const status = Object.prototype.hasOwnProperty.call(MEDIA_STATUS_LABELS, row.status)
    ? row.status
    : "pending";
  const kind = Object.prototype.hasOwnProperty.call(KIND_LABELS, row.kind) ? row.kind : null;
  return {
    id,
    shopId: uuid(row.shop_id ?? row.shopId),
    shopName: cleanText(row.shopName ?? row.shop_name, 80) || null,
    productId: uuid(row.product_id ?? row.productId),
    bucket: cleanText(row.bucket, 40) || null,
    bucketLabel: bucketLabel(row.bucket),
    path,
    mime: cleanText(row.mime, 80) || null,
    bytes: bytes(row.bytes),
    sizeLabel: formatBytes(row.bytes),
    kind,
    kindLabel: kindLabel(row.kind),
    status,
    statusLabel: mediaStatusLabel(status),
    note: cleanText(row.review_note ?? row.reviewNote, 300) || null,
    createdAt: isoDate(row.created_at ?? row.createdAt),
    reviewedAt: isoDate(row.reviewed_at ?? row.reviewedAt),
  };
}

export function normalizeMediaList(rows) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const item = normalizeMedia(row);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out.sort((a, b) => {
    const at = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bt = b.createdAt ? Date.parse(b.createdAt) : 0;
    return bt - at;
  });
}

export function summarizeMedia(rows) {
  const list = normalizeMediaList(rows);
  const count = (status) => list.filter((m) => m.status === status).length;
  return {
    count: list.length,
    pending: count("pending"),
    quarantined: count("quarantined"),
    approved: count("approved"),
    rejected: count("rejected"),
    bytes: list.reduce((sum, m) => sum + m.bytes, 0),
  };
}

export function assessModerationAccess({ moduleAvailable, role, aal } = {}) {
  if (!moduleAvailable) {
    return {
      ok: false,
      reason: "module_absent",
      title: "La modération des médias n'est pas encore activée",
      message:
        "Le stockage et la modération ne sont pas installés sur le serveur. Aucun média n'est simulé.",
    };
  }
  if (!isModerationRole(role)) {
    return {
      ok: false,
      reason: "not_staff",
      title: "Accès réservé à l'équipe",
      message:
        "Seuls le propriétaire, un administrateur ou un modérateur peuvent examiner les médias.",
    };
  }
  if (aal !== "aal2") {
    return {
      ok: false,
      reason: "mfa_required",
      title: "Double vérification requise",
      message:
        "Le serveur exige aal2 pour modérer un média. Activez la double vérification dans le QG.",
    };
  }
  return {
    ok: true,
    reason: "ready",
    title: "Modération des médias",
    message:
      "Chaque décision est humaine. Refuser un média le retire et rend son quota ; aucun fichier n'est supprimé par le navigateur.",
  };
}

export function validateReview({ media, status, note } = {}) {
  if (!media) return { ok: false, error: "Ce média est déjà traité ou introuvable." };
  if (media.status === "deleted" || media.status === "rejected") {
    return { ok: false, error: "Ce média est déjà retiré." };
  }
  const reviewable = QUEUE_STATUSES.includes(media.status) || media.status === "approved";
  if (!reviewable) {
    return { ok: false, error: "Ce média est déjà traité ou introuvable." };
  }
  if (!REVIEW_STATUSES.includes(status)) {
    return { ok: false, error: "Décision inconnue." };
  }
  const clean = cleanText(note, 300);
  if (status === "rejected" && clean.length < 5) {
    return { ok: false, error: "Écrivez le motif du refus (5 caractères minimum)." };
  }
  return { ok: true, status, note: clean || null };
}

export function reviewActionLabel(status) {
  if (status === "approved") return "Approuver";
  if (status === "quarantined") return "Mettre en quarantaine";
  if (status === "rejected") return "Refuser et retirer";
  return "Décider";
}

export function nextQueue(rows) {
  return normalizeMediaList(rows)
    .filter((m) => QUEUE_STATUSES.includes(m.status))
    .sort((a, b) => {
      const at = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bt = b.createdAt ? Date.parse(b.createdAt) : 0;
      return at - bt;
    });
}

export const PREVIEW_BUCKETS = Object.freeze([
  "product-images",
  "shop-logos",
  "relay-photos",
]);

export function canPreview(media) {
  return Boolean(
    media &&
      media.kind === "image" &&
      PREVIEW_BUCKETS.includes(media.bucket) &&
      typeof media.path === "string" &&
      media.path.length > 0 &&
      !media.path.startsWith("demo:"),
  );
}
