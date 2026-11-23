// VAlex - logique pure de la console des litiges (p47, staff + MFA).
//
// Trois decisions humaines, trois consequences distinctes :
//   - `release` libere les fonds bloques au vendeur : c'est le SEUL choix qui
//     deplace de l'argent, et il exige le mot exact `LIBERER` ;
//   - `refund` ne rend aucun argent ici : la commande passe en
//     `refund_pending` pour un traitement humain dans `#/remboursements` ;
//   - `reject` renvoie la commande en attente de confirmation, sans mouvement.
//
// Aucune decision n'est automatique et aucun litige n'est invente.

export const DISPUTE_ROLES = Object.freeze(["owner", "admin", "moderator"]);
export const OPEN_STATUSES = Object.freeze(["open", "under_review"]);
export const ALL_STATUSES = Object.freeze(["open", "under_review", "resolved", "rejected"]);
export const DECISIONS = Object.freeze(["release", "refund", "reject"]);
export const CONFIRM_RELEASE = "LIBERER";
export const NOTE_MIN = 10;

export const STATUS_LABELS = Object.freeze({
  open: "Ouvert",
  under_review: "En examen",
  resolved: "Résolu",
  rejected: "Rejeté",
});

export const DECISION_LABELS = Object.freeze({
  release: "Libérer les fonds au vendeur",
  refund: "Transmettre au remboursement",
  reject: "Renvoyer en confirmation",
});

export const DECISION_NOTICES = Object.freeze({
  release:
    "Les fonds bloqués par cette commande seront libérés au vendeur. C'est la seule décision qui déplace de l'argent.",
  refund:
    "Aucun argent n'est rendu ici : la commande passe en attente de remboursement. Le remboursement réel se fait ensuite dans #/remboursements, avec une preuve.",
  reject:
    "La commande revient en attente de confirmation par l'acheteur. Aucun argent ne bouge.",
});

export const ORDER_STATE_LABELS = Object.freeze({
  pending_payment: "Paiement en attente",
  paid: "Payé",
  accepted_by_seller: "Accepté par le vendeur",
  preparing: "En préparation",
  ready_for_pickup: "Prêt au retrait",
  in_transit: "En route",
  delivered_pending_confirmation: "Livré, à confirmer",
  confirmed_received: "Réception confirmée",
  dispute_open: "Litige ouvert",
  refund_pending: "Remboursement à traiter",
  refunded: "Remboursé",
  cancelled: "Annulé",
  expired: "Expiré",
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

function cents(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}

function isoDate(value) {
  if (typeof value !== "string") return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "—";
  return `${Math.floor(n / 100)},${String(n % 100).padStart(2, "0")} HTG`;
}

export function disputeStatusLabel(status) {
  return STATUS_LABELS[status] || "Statut inconnu";
}

export function decisionLabel(decision) {
  return DECISION_LABELS[decision] || "Décider";
}

export function decisionNotice(decision) {
  return DECISION_NOTICES[decision] || "";
}

export function orderStateLabel(state) {
  return ORDER_STATE_LABELS[state] || "État inconnu";
}

export function isDisputeRole(role) {
  return DISPUTE_ROLES.includes(role);
}

export function isOpenStatus(status) {
  return OPEN_STATUSES.includes(status);
}

export function isClosed(dispute) {
  return Boolean(dispute && (dispute.status === "resolved" || dispute.status === "rejected"));
}

export function movesMoney(decision) {
  return decision === "release";
}

export function formatCents(value) {
  return money(value);
}

export function normalizeDispute(row) {
  if (!isPlainObject(row)) return null;
  const id = uuid(row.id);
  const orderId = uuid(row.order_id ?? row.orderId);
  if (!id || !orderId) return null;
  const status = Object.prototype.hasOwnProperty.call(STATUS_LABELS, row.status)
    ? row.status
    : "open";
  const decision = Object.prototype.hasOwnProperty.call(DECISION_LABELS, row.decision)
    ? row.decision
    : null;
  return {
    id,
    orderId,
    orderNumber: cleanText(row.orderNumber ?? row.order_number ?? row.number, 40) || null,
    orderTotalCents: cents(row.orderTotalCents ?? row.order_total_cents ?? row.total_cents),
    orderTotalLabel: money(row.orderTotalCents ?? row.order_total_cents ?? row.total_cents),
    orderState: cleanText(row.orderState ?? row.fulfillment_state, 40) || null,
    shopId: uuid(row.shop_id ?? row.shopId),
    shopName: cleanText(row.shopName ?? row.shop_name, 80) || null,
    openedBy: uuid(row.opened_by ?? row.openedBy),
    assignedTo: uuid(row.assigned_to ?? row.assignedTo),
    reason: cleanText(row.reason, 200) || null,
    description: cleanText(row.description, 2000) || null,
    status,
    statusLabel: disputeStatusLabel(status),
    decision,
    decisionLabel: decision ? decisionLabel(decision) : null,
    decisionNote: cleanText(row.decision_note ?? row.decisionNote, 2000) || null,
    createdAt: isoDate(row.created_at ?? row.createdAt),
    updatedAt: isoDate(row.updated_at ?? row.updatedAt),
    decidedAt: isoDate(row.decided_at ?? row.decidedAt),
  };
}

export function normalizeDisputes(rows) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const item = normalizeDispute(row);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function sortQueue(rows) {
  return normalizeDisputes(rows)
    .filter((d) => isOpenStatus(d.status))
    .sort((a, b) => {
      const at = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bt = b.createdAt ? Date.parse(b.createdAt) : 0;
      return at - bt;
    });
}

export function sortRecent(rows) {
  return normalizeDisputes(rows)
    .filter((d) => isClosed(d))
    .sort((a, b) => {
      const at = a.decidedAt ? Date.parse(a.decidedAt) : a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const bt = b.decidedAt ? Date.parse(b.decidedAt) : b.updatedAt ? Date.parse(b.updatedAt) : 0;
      return bt - at;
    });
}

export function summarizeDisputes(rows) {
  const list = normalizeDisputes(rows);
  const count = (status) => list.filter((d) => d.status === status).length;
  return {
    count: list.length,
    open: count("open"),
    under_review: count("under_review"),
    resolved: count("resolved"),
    rejected: count("rejected"),
    pending: list.filter((d) => isOpenStatus(d.status)).length,
    unassigned: list.filter((d) => isOpenStatus(d.status) && !d.assignedTo).length,
  };
}

export function assessAccess({ moduleAvailable, role, aal } = {}) {
  if (!moduleAvailable) {
    return {
      ok: false,
      reason: "module_absent",
      title: "Les litiges ne sont pas encore activés",
      message:
        "Les commandes et litiges ne sont pas installés sur le serveur. Aucun litige n'est simulé.",
    };
  }
  if (!isDisputeRole(role)) {
    return {
      ok: false,
      reason: "not_staff",
      title: "Accès réservé à l'équipe",
      message:
        "Seuls le propriétaire, un administrateur ou un modérateur peuvent instruire un litige.",
    };
  }
  if (aal !== "aal2") {
    return {
      ok: false,
      reason: "mfa_required",
      title: "Double vérification requise",
      message:
        "Le serveur exige aal2 pour prendre ou trancher un litige. Activez la double vérification dans le QG.",
    };
  }
  return {
    ok: true,
    reason: "ready",
    title: "Litiges",
    message:
      "Libérer les fonds est la seule décision qui déplace de l'argent : elle exige le mot LIBERER. Transmettre au remboursement ne rend rien ici. Aucune décision n'est automatique.",
  };
}

export function canClaim(dispute, meId) {
  if (!dispute) return false;
  if (!isOpenStatus(dispute.status)) return false;
  if (meId && dispute.assignedTo === meId) return false;
  return true;
}

export function nextDecisions(dispute) {
  if (!dispute || isClosed(dispute)) return [];
  return [...DECISIONS];
}

export function validateClaim({ dispute, meId } = {}) {
  if (!dispute) return { ok: false, error: "Litige introuvable." };
  if (!isOpenStatus(dispute.status)) return { ok: false, error: "Ce litige est déjà clos." };
  if (meId && dispute.assignedTo === meId) {
    return { ok: false, error: "Ce litige vous est déjà attribué." };
  }
  return { ok: true };
}

export function validateDecision({ dispute, decision, note, confirm } = {}) {
  if (!dispute) return { ok: false, error: "Litige introuvable." };
  if (!DECISIONS.includes(decision)) return { ok: false, error: "Décision inconnue." };
  if (isClosed(dispute)) return { ok: false, error: "Ce litige est déjà clos." };

  const clean = cleanText(note, 2000);
  if (clean.length < NOTE_MIN) {
    return { ok: false, error: "Écrivez une justification de 10 caractères minimum." };
  }
  if (movesMoney(decision) && String(confirm ?? "").trim() !== CONFIRM_RELEASE) {
    return {
      ok: false,
      error: `Tapez exactement ${CONFIRM_RELEASE} pour confirmer la libération des fonds.`,
    };
  }
  return { ok: true, decision, note: clean };
}
