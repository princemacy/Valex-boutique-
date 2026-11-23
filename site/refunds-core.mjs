// VAlex - logique pure de la console de remboursements (p51, owner + MFA).
// Aucune decision n'est automatique. Aucune fonction de mouvement n'est
// appelee ici : les gardes sont pures, le serveur reste seul juge.

export const REFUND_STATUS_LABELS = Object.freeze({
  requested: "Demandé",
  under_review: "En examen",
  approved: "Approuvé",
  processing: "En cours",
  completed: "Terminé",
  rejected: "Refusé",
  failed: "Échec",
});

export const PAYMENT_STATUS_LABELS = Object.freeze({
  created: "Créé",
  pending: "En attente",
  authorized: "Autorisé",
  paid: "Encaissé",
  failed: "Échec",
  expired: "Expiré",
  refunded: "Remboursé",
});

export const PROVIDER_LABELS = Object.freeze({
  kobara: "Kobara",
  moncashconnect: "MonCashConnect",
});

export const DECIDABLE_STATUSES = Object.freeze(["requested", "under_review"]);
export const COMPLETABLE_STATUSES = Object.freeze(["approved"]);
export const CONFIRM_WORD = "REMBOURSER";

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
  return Number.isSafeInteger(n) ? n : 0;
}

function isoDate(value) {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

export function refundStatusLabel(status) {
  return REFUND_STATUS_LABELS[status] || "Statut inconnu";
}

export function paymentStatusLabel(status) {
  return PAYMENT_STATUS_LABELS[status] || "Statut inconnu";
}

export function providerLabel(provider) {
  return PROVIDER_LABELS[provider] || cleanText(provider, 30) || "Prestataire";
}

export function formatCents(value) {
  const n = cents(value);
  const abs = Math.abs(n);
  const units = Math.floor(abs / 100);
  const rest = abs % 100;
  const body =
    new Intl.NumberFormat("fr-FR").format(units) +
    (rest ? "," + String(rest).padStart(2, "0") : "");
  return (n < 0 ? "-" : "") + body + " HTG";
}

export function normalizeIntent(row) {
  if (!isPlainObject(row)) return null;
  const id = uuid(row.id);
  if (!id) return null;
  const status = Object.prototype.hasOwnProperty.call(PAYMENT_STATUS_LABELS, row.status)
    ? row.status
    : "created";
  return {
    id,
    orderId: uuid(row.order_id ?? row.orderId),
    provider: cleanText(row.provider, 30) || null,
    providerLabel: providerLabel(row.provider),
    providerRef: cleanText(row.provider_ref ?? row.providerRef, 80) || null,
    amountCents: cents(row.amount_cents ?? row.amountCents),
    currency: cleanText(row.currency, 8) || "HTG",
    status,
    statusLabel: paymentStatusLabel(status),
    createdAt: isoDate(row.created_at ?? row.createdAt),
  };
}

export function normalizeRefund(row, intent) {
  if (!isPlainObject(row)) return null;
  const id = uuid(row.id);
  const amountCents = cents(row.amount_cents ?? row.amountCents);
  if (!id || amountCents <= 0) return null;
  const status = Object.prototype.hasOwnProperty.call(REFUND_STATUS_LABELS, row.status)
    ? row.status
    : "requested";
  const parent = normalizeIntent(intent);
  return {
    id,
    intentId: uuid(row.payment_intent_id ?? row.paymentIntentId),
    orderId: uuid(row.order_id ?? row.orderId),
    amountCents,
    feeCents: cents(row.fee_cents ?? row.feeCents),
    netCents: cents(row.net_cents ?? row.netCents),
    status,
    statusLabel: refundStatusLabel(status),
    reason: cleanText(row.reason, 500) || null,
    providerRef: cleanText(row.provider_ref ?? row.providerRef, 80) || null,
    requestedAt: isoDate(row.created_at ?? row.requestedAt),
    decidedAt: isoDate(row.decided_at ?? row.decidedAt),
    completedAt: isoDate(row.completed_at ?? row.completedAt),
    intent: parent,
    canDecide: DECIDABLE_STATUSES.includes(status),
    canComplete:
      COMPLETABLE_STATUSES.includes(status) &&
      parent !== null &&
      parent.status === "paid" &&
      parent.amountCents === amountCents,
  };
}

export function normalizeRefunds(rows, intents) {
  const byId = {};
  for (const intent of Array.isArray(intents) ? intents : []) {
    const item = normalizeIntent(intent);
    if (item) byId[item.id] = item;
  }
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== "object") continue;
    const refund = normalizeRefund(row, byId[uuid(row.payment_intent_id ?? row.paymentIntentId)]);
    if (!refund || seen.has(refund.id)) continue;
    seen.add(refund.id);
    out.push(refund);
  }
  return out.sort((a, b) => {
    const at = a.requestedAt ? Date.parse(a.requestedAt) : 0;
    const bt = b.requestedAt ? Date.parse(b.requestedAt) : 0;
    return bt - at;
  });
}

export function sumRefunds(refunds) {
  const list = Array.isArray(refunds) ? refunds : [];
  const completed = list.filter((r) => r.status === "completed");
  return {
    count: list.length,
    toDecide: list.filter((r) => DECIDABLE_STATUSES.includes(r.status)).length,
    approved: list.filter((r) => r.status === "approved").length,
    completed: completed.length,
    completedCents: completed.reduce((sum, r) => sum + r.amountCents, 0),
  };
}

export function normalizeQuote(data) {
  if (!isPlainObject(data)) return null;
  const paid = cents(data.paid_cents ?? data.paidCents);
  const already = cents(data.already_refunded_cents ?? data.alreadyRefundedCents);
  const max = cents(data.max_refundable_cents ?? data.maxRefundableCents);
  const amount = cents(data.amount_cents ?? data.amountCents);
  const fee = cents(data.fee_cents ?? data.feeCents);
  const net = cents(data.net_cents ?? data.netCents);
  if (paid <= 0 || amount <= 0) return null;
  if (max < 0 || already < 0 || fee < 0 || net < 0) return null;
  if (amount > max) return null;
  return {
    paidCents: paid,
    alreadyRefundedCents: already,
    maxRefundableCents: max,
    amountCents: amount,
    feeCents: fee,
    netCents: net,
    initialValexFeeCents: cents(data.initial_valex_fee_cents ?? data.initialValexFeeCents),
    initialKobaraFeeCents: cents(data.initial_kobara_fee_cents ?? data.initialKobaraFeeCents),
    kobaraRefundable: data.kobara_refundable === true || data.kobaraRefundable === true,
    requiresOwnerDecision:
      data.requires_owner_decision !== false && data.requiresOwnerDecision !== false,
  };
}

export function assessRefundsAccess({ moduleAvailable, isOwner, aal } = {}) {
  if (!moduleAvailable) {
    return {
      ok: false,
      reason: "module_absent",
      title: "Les remboursements ne sont pas encore activés",
      message:
        "Les paiements et les remboursements ne sont pas installés sur le serveur. Aucun remboursement n'est simulé.",
    };
  }
  if (!isOwner) {
    return {
      ok: false,
      reason: "not_owner",
      title: "Accès réservé au propriétaire",
      message: "Seul le propriétaire peut décider et exécuter un remboursement.",
    };
  }
  if (aal !== "aal2") {
    return {
      ok: false,
      reason: "mfa_required",
      title: "Double vérification requise",
      message:
        "Le serveur exige aal2 pour décider ou exécuter un remboursement. Activez la double vérification dans le QG.",
    };
  }
  return {
    ok: true,
    reason: "ready",
    title: "Remboursements accessibles",
    message:
      "Chaque décision est humaine. L'exécution déplace de l'argent réel et reste confirmée par le serveur.",
  };
}

export function validateDecision({ refund, decision, note } = {}) {
  if (!refund || !DECIDABLE_STATUSES.includes(refund.status)) {
    return { ok: false, error: "Ce remboursement est déjà traité ou introuvable." };
  }
  if (decision !== "approve" && decision !== "reject") {
    return { ok: false, error: "Décision inconnue." };
  }
  const clean = cleanText(note, 500);
  if (clean.length < 10) {
    return { ok: false, error: "Écrivez une justification d'au moins 10 caractères." };
  }
  return { ok: true, decision, note: clean };
}

export function validateCompletion({
  refund,
  intent,
  confirmation,
  providerRef,
  restoreValex,
  restoreKobara,
} = {}) {
  if (!refund) return { ok: false, error: "Remboursement introuvable." };
  if (refund.status === "completed") {
    return { ok: false, error: "Ce remboursement est déjà terminé." };
  }
  if (!COMPLETABLE_STATUSES.includes(refund.status)) {
    return { ok: false, error: "Le remboursement doit être approuvé avant exécution." };
  }
  const parent = normalizeIntent(intent);
  if (!parent || parent.status !== "paid") {
    return { ok: false, error: "Le paiement n'est pas encaissé ou il est déjà remboursé." };
  }
  if (parent.amountCents !== refund.amountCents) {
    return {
      ok: false,
      error:
        "Remboursement partiel : le serveur exige un arbitrage manuel. Cette console n'exécute que le remboursement intégral.",
    };
  }
  if (cleanText(confirmation, 40).toUpperCase() !== CONFIRM_WORD) {
    return { ok: false, error: `Tapez exactement ${CONFIRM_WORD} pour confirmer.` };
  }
  const ref = cleanText(providerRef, 80);
  if (ref && ref.length < 3) {
    return { ok: false, error: "Référence prestataire trop courte." };
  }
  return {
    ok: true,
    providerRef: ref,
    restoreValex: Boolean(restoreValex),
    restoreKobara: Boolean(restoreKobara),
  };
}

export function validateRequest({ intent, quote, reason } = {}) {
  const parent = normalizeIntent(intent);
  if (!parent) return { ok: false, error: "Paiement introuvable." };
  if (parent.status !== "paid") {
    return { ok: false, error: "Ce paiement n'est pas encaissé." };
  }
  const q = normalizeQuote(quote);
  if (!q) return { ok: false, error: "Devis de remboursement illisible." };
  if (q.amountCents !== parent.amountCents) {
    return { ok: false, error: "Le remboursement doit porter sur le montant intégral." };
  }
  if (q.alreadyRefundedCents !== 0 || q.maxRefundableCents !== parent.amountCents) {
    return {
      ok: false,
      error:
        "Ce paiement a déjà un remboursement approuvé ou terminé. Un remboursement partiel exige un arbitrage manuel.",
    };
  }
  const clean = cleanText(reason, 500);
  if (clean.length < 5) {
    return { ok: false, error: "Écrivez le motif du remboursement (5 caractères minimum)." };
  }
  return { ok: true, reason: clean, amountCents: parent.amountCents };
}

export function idempotencyKey(value) {
  const key = cleanText(value, 80);
  return key.length >= 8 ? key : null;
}

export function assessBuyerRefundsAccess({ moduleAvailable, signedIn } = {}) {
  if (!moduleAvailable) {
    return {
      ok: false,
      reason: "module_absent",
      title: "Le suivi des remboursements n'est pas encore activé",
      message:
        "Les remboursements ne sont pas installés sur le serveur. Aucun remboursement n'est simulé.",
    };
  }
  if (!signedIn) {
    return {
      ok: false,
      reason: "signed_out",
      title: "Connectez-vous",
      message: "Connectez-vous pour suivre l'état de vos remboursements.",
    };
  }
  return {
    ok: true,
    reason: "ready",
    title: "Suivi des remboursements",
    message:
      "Vous voyez ici les remboursements de vos commandes. La décision appartient à VAlex ; vous ne pouvez pas la déclencher vous-même.",
  };
}

export function buyerRefundSteps(refund) {
  if (!refund || typeof refund !== "object") return [];
  const status = refund.status;
  const terminal = status === "rejected" || status === "failed";
  const reviewed = ["under_review", "approved", "processing", "completed", "rejected", "failed"].includes(status);
  const approved = ["approved", "processing", "completed"].includes(status);
  const completed = status === "completed";
  const decisionLabel =
    status === "rejected" ? "Demande refusée" : status === "failed" ? "Échec du remboursement" : "Approuvé";
  return [
    { key: "requested", label: "Demande reçue", done: true, at: refund.requestedAt || null },
    { key: "reviewed", label: "Examen par VAlex", done: reviewed, at: null },
    { key: "decision", label: decisionLabel, done: terminal || approved, at: refund.decidedAt || null },
    { key: "completed", label: "Remboursement effectué", done: completed, at: refund.completedAt || null },
  ];
}

export function buyerRefundNote(refund) {
  if (!refund || typeof refund !== "object") return null;
  switch (refund.status) {
    case "requested":
      return "Votre demande est enregistrée. VAlex doit encore l'examiner.";
    case "under_review":
      return "VAlex examine votre demande. Aucun argent n'a encore bougé.";
    case "approved":
      return "Votre remboursement est approuvé. Il sera exécuté par VAlex, jamais automatiquement.";
    case "processing":
      return "Le remboursement est en cours chez le prestataire de paiement.";
    case "completed":
      return "Le remboursement a été exécuté. Vérifiez votre compte de paiement.";
    case "rejected":
      return "Votre demande a été refusée. La justification est conservée par VAlex.";
    case "failed":
      return "Le remboursement a échoué. VAlex doit reprendre le dossier manuellement.";
    default:
      return null;
  }
}
