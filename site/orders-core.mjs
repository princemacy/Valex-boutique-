// VAlex - logique pure du parcours de commande (p47).
// Aucun acces reseau, aucun contenu invente.
//
// Contrat p47 :
//   - `orders.fulfillment_state` porte le parcours cible ; l'ancien
//     `orders.status` reste synchronise par un trigger ;
//   - l'OTP de reception est emis par `order_issue_otp` puis verifie par
//     `order_confirm_receipt`, qui renvoie 'incorrect' sans lever d'exception
//     pour conserver le compteur d'essais ;
//   - aucune liberation ni aucun remboursement automatique ;
//   - `order_transition` refuse les etats financiers reserves.

export const FULFILLMENT_LABELS = Object.freeze({
  pending_payment: "En attente de paiement",
  paid: "Payée, à accepter",
  accepted_by_seller: "Acceptée par le vendeur",
  preparing: "En préparation",
  ready_for_pickup: "Prête pour le retrait",
  in_transit: "En route",
  delivered_pending_confirmation: "Livrée, en attente de confirmation",
  confirmed_received: "Réception confirmée",
  dispute_open: "Litige ouvert",
  refund_pending: "Remboursement en attente",
  refunded: "Remboursée",
  cancelled: "Annulée",
  expired: "Expirée",
});

export const FULFILLMENT_STATES = Object.freeze(Object.keys(FULFILLMENT_LABELS));

// Etats ou l'acheteur peut demander puis saisir un code de reception.
export const RECEIPT_STATES = Object.freeze([
  "ready_for_pickup",
  "in_transit",
  "delivered_pending_confirmation",
]);

// Etats ou un litige peut etre ouvert (cf. `dispute_open`).
export const DISPUTE_STATES = Object.freeze([
  "paid",
  "accepted_by_seller",
  "preparing",
  "ready_for_pickup",
  "in_transit",
  "delivered_pending_confirmation",
]);

// Etats financiers reserves aux procedures dediees : jamais proposes comme
// transition ordinaire.
export const RESERVED_TRANSITIONS = Object.freeze([
  "confirmed_received",
  "refunded",
  "dispute_open",
  "refund_pending",
]);

export const PROOF_KINDS = Object.freeze([
  ["shipment", "Expédition"],
  ["delivery", "Livraison"],
  ["pickup", "Retrait"],
  ["buyer_claim", "Réclamation acheteur"],
  ["seller_response", "Réponse vendeur"],
  ["other", "Autre"],
]);

export const DISPUTE_STATUS_LABELS = Object.freeze({
  open: "Ouvert",
  under_review: "En cours d'examen",
  resolved: "Résolu",
  rejected: "Rejeté",
});

export const PROOF_MAX_NOTE = 2000;
export const REASON_MAX = 200;
export const DISPUTE_DESC_MAX = 2000;

const PROOF_KEYS = PROOF_KINDS.map(([key]) => key);
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

function cleanBody(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

function uuid(value) {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

export function fulfillmentLabel(state) {
  return FULFILLMENT_LABELS[state] || "État inconnu";
}

export function isKnownState(state) {
  return FULFILLMENT_STATES.includes(state);
}

export function canIssueReceipt(state) {
  return RECEIPT_STATES.includes(state);
}

export function canConfirmReceipt(state) {
  return RECEIPT_STATES.includes(state);
}

export function canOpenDispute(state) {
  return DISPUTE_STATES.includes(state);
}

// Etapes lisibles, adaptees au mode de remise.
export function progressSteps(deliveryMode) {
  const base = [
    ["pending_payment", "Commande"],
    ["paid", "Paiement"],
    ["accepted_by_seller", "Acceptée"],
    ["preparing", "Préparation"],
  ];
  const middle =
    deliveryMode === "pickup"
      ? [["ready_for_pickup", "Prête"]]
      : [["in_transit", "En route"]];
  return [...base, ...middle, ["delivered_pending_confirmation", "Remise"], ["confirmed_received", "Confirmée"]];
}

export function progressIndex(state, deliveryMode) {
  const steps = progressSteps(deliveryMode);
  const index = steps.findIndex(([key]) => key === state);
  if (index >= 0) return index;
  // Un litige ou un remboursement suit la remise : on garde la barre pleine
  // jusqu'a "Remise" sans pretendre que la reception est confirmee.
  if (state === "dispute_open" || state === "refund_pending" || state === "refunded") {
    return steps.length - 2;
  }
  return -1;
}

// Transitions qu'un vendeur peut demander. Reflet fidele de `order_transition`,
// qui reste seul juge. Les etats reserves ne sont jamais proposes.
export function sellerTransitions({ state, deliveryMode } = {}) {
  const out = [];
  if (!isKnownState(state)) return out;
  const pickup = deliveryMode === "pickup";
  if (state === "paid") out.push("accepted_by_seller", "cancelled");
  if (state === "accepted_by_seller") out.push("preparing", ...(pickup ? [] : ["in_transit"]), "cancelled");
  if (state === "preparing") out.push(...(pickup ? ["ready_for_pickup"] : ["in_transit"]), "cancelled");
  if (state === "ready_for_pickup" || state === "in_transit") {
    out.push("delivered_pending_confirmation");
  }
  return out.filter((to) => !RESERVED_TRANSITIONS.includes(to));
}

// Transitions qu'un acheteur peut demander. Seule l'annulation d'une commande
// encore impayee est ouverte cote client.
export function buyerTransitions({ state } = {}) {
  return state === "pending_payment" ? ["cancelled"] : [];
}

export const TRANSITION_LABELS = Object.freeze({
  accepted_by_seller: "Accepter la commande",
  preparing: "Commencer la préparation",
  ready_for_pickup: "Prête pour le retrait",
  in_transit: "Marquer en route",
  delivered_pending_confirmation: "Marquer remise au client",
  cancelled: "Annuler",
});

export function transitionLabel(to) {
  return TRANSITION_LABELS[to] || to;
}

export function normalizeCode(value) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 6);
}

export function isValidReceiptCode(value) {
  return /^[0-9]{6}$/.test(normalizeCode(value));
}

export function validateReceiptCode(value) {
  const code = normalizeCode(value);
  if (!/^[0-9]{6}$/.test(code)) throw new Error("code_reception_invalide");
  return code;
}

// Traduit le retour de `order_confirm_receipt`. 'incorrect' n'est pas une
// erreur technique : le compteur d'essais a bien ete incremente cote serveur.
export function receiptResultMessage(result) {
  if (result === "confirmed_received") {
    return { ok: true, incorrect: false, message: "Réception confirmée. Merci." };
  }
  if (result === "incorrect") {
    return {
      ok: false,
      incorrect: true,
      message:
        "Code incorrect. Vérifiez les 6 chiffres : le nombre d'essais est limité, puis il faudra demander un nouveau code.",
    };
  }
  return {
    ok: false,
    incorrect: false,
    message: "La confirmation n'a pas abouti. Réessayez.",
  };
}

export function normalizeOrder(row) {
  if (!isPlainObject(row)) return null;
  const id = uuid(row.id);
  if (!id) return null;
  const state = isKnownState(row.fulfillment_state) ? row.fulfillment_state : null;
  return {
    id,
    state,
    stateLabel: state ? fulfillmentLabel(state) : null,
    legacyStatus: typeof row.status === "string" ? row.status : null,
    deliveryMode: typeof row.delivery_mode === "string" ? row.delivery_mode : null,
    buyerId: uuid(row.buyer_id),
    shopId: uuid(row.shop_id),
    paymentMethod: typeof row.payment_method === "string" ? row.payment_method : null,
    paymentStatus: typeof row.payment_status === "string" ? row.payment_status : null,
    canIssueReceipt: state ? canIssueReceipt(state) : false,
    canConfirmReceipt: state ? canConfirmReceipt(state) : false,
    canDispute: state ? canOpenDispute(state) : false,
    sellerTransitions: sellerTransitions({ state, deliveryMode: row.delivery_mode }),
  };
}

export function validateProof({ kind, storagePath, note } = {}) {
  if (!PROOF_KEYS.includes(kind)) throw new Error("type_preuve_inconnu");
  const path = cleanText(storagePath, 300) || null;
  const message = cleanBody(note, PROOF_MAX_NOTE) || null;
  if (!path && !message) throw new Error("preuve_vide");
  return { kind, storagePath: path, note: message };
}

export function validateDispute({ reason, description } = {}) {
  const cleanReason = cleanText(reason, REASON_MAX);
  if (cleanReason.length < 3) throw new Error("motif_litige_requis");
  return {
    reason: cleanReason,
    description: cleanBody(description, DISPUTE_DESC_MAX) || null,
  };
}

export function buildConfirmParams({ orderId, code } = {}) {
  const order = uuid(orderId);
  if (!order) throw new Error("commande_invalide");
  return { p_order: order, p_code: validateReceiptCode(code) };
}

export function buildIssueParams({ orderId } = {}) {
  const order = uuid(orderId);
  if (!order) throw new Error("commande_invalide");
  return { p_order: order };
}

export function buildTransitionParams({ orderId, to, note } = {}) {
  const order = uuid(orderId);
  if (!order) throw new Error("commande_invalide");
  if (RESERVED_TRANSITIONS.includes(to)) throw new Error("transition_reservee");
  const targets = Object.keys(TRANSITION_LABELS);
  if (!targets.includes(to)) throw new Error("transition_inconnue");
  return { p_order: order, p_to: to, p_note: cleanText(note, 500) || null };
}

export function buildProofParams({ orderId, kind, storagePath, note } = {}) {
  const order = uuid(orderId);
  if (!order) throw new Error("commande_invalide");
  const clean = validateProof({ kind, storagePath, note });
  return {
    p_order: order,
    p_kind: clean.kind,
    p_storage_path: clean.storagePath,
    p_note: clean.note,
  };
}

export function buildDisputeParams({ orderId, reason, description } = {}) {
  const order = uuid(orderId);
  if (!order) throw new Error("commande_invalide");
  const clean = validateDispute({ reason, description });
  return { p_order: order, p_reason: clean.reason, p_description: clean.description };
}

export function normalizeProof(row) {
  if (!isPlainObject(row)) return null;
  const id = String(row.id ?? "").trim();
  if (!id) return null;
  const kind = PROOF_KEYS.includes(row.kind) ? row.kind : "other";
  return {
    id,
    kind,
    kindLabel: (PROOF_KINDS.find(([key]) => key === kind) || PROOF_KINDS[5])[1],
    storagePath: cleanText(row.storage_path, 300) || null,
    note: cleanBody(row.note, PROOF_MAX_NOTE) || null,
    actorId: uuid(row.actor_id),
    createdAt: typeof row.created_at === "string" && !Number.isNaN(Date.parse(row.created_at))
      ? row.created_at
      : null,
  };
}

export function normalizeProofs(rows) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const item = normalizeProof(row);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function normalizeDispute(row) {
  if (!isPlainObject(row)) return null;
  const id = uuid(row.id);
  if (!id) return null;
  const status = Object.prototype.hasOwnProperty.call(DISPUTE_STATUS_LABELS, row.status)
    ? row.status
    : "open";
  return {
    id,
    orderId: uuid(row.order_id),
    openedBy: uuid(row.opened_by),
    reason: cleanText(row.reason, REASON_MAX),
    description: cleanBody(row.description, DISPUTE_DESC_MAX) || null,
    status,
    statusLabel: DISPUTE_STATUS_LABELS[status],
    decision: cleanText(row.decision, 40) || null,
    decisionNote: cleanBody(row.decision_note, DISPUTE_DESC_MAX) || null,
    createdAt: typeof row.created_at === "string" && !Number.isNaN(Date.parse(row.created_at))
      ? row.created_at
      : null,
  };
}

// Affichage d'un delai estime. `delivery_estimate` reste indicatif.
export function estimateLabel(estimate) {
  if (!isPlainObject(estimate)) return null;
  const min = Number(estimate.min_hours);
  const max = Number(estimate.max_hours);
  if (!Number.isFinite(min) || min <= 0) return null;
  const human = (hours) => {
    if (hours >= 48 && hours % 24 === 0) return `${hours / 24} jours`;
    if (hours === 24) return "24 heures";
    return `${hours} heures`;
  };
  const scope = cleanText(estimate.label, 60) || "Zone";
  const span = Number.isFinite(max) && max !== min ? `${human(min)} à ${human(max)}` : human(min);
  return `${scope} : environ ${span} (indicatif)`;
}
