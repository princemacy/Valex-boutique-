// VAlex - logique pure des decisions de retrait (p46).
// Aucun versement n'est execute par le navigateur : `withdrawal_decide`
// change un statut et, en cas de refus, rend l'argent au portefeuille.
//
// Le statut `paid` n'est jamais propose ici : il affirmerait qu'un
// versement reel a eu lieu hors du site. Cette preuve reste serveur.

import { PENDING_WITHDRAWAL_STATUSES, withdrawalStatusLabel } from "./finance-core.mjs";
import { formatCents } from "./ads-core.mjs";

export const DECISION_ROLES = Object.freeze(["owner", "admin"]);
export const DECISIONS = Object.freeze(["approved", "processing", "failed", "rejected"]);
export const CONFIRM_REJECT = "REFUSER";
export const PAID_NOTICE =
  "Le statut « payé » n'est pas proposé : il exige une preuve de versement réel hors du site. Aucun versement n'est déclenché ici.";

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

export function decisionLabel(status) {
  if (status === "approved") return "Approuver";
  if (status === "processing") return "Passer en cours";
  if (status === "failed") return "Marquer en échec";
  if (status === "rejected") return "Refuser et rendre l'argent";
  return "Décider";
}

export function isOwnerRole(role) {
  return DECISION_ROLES.includes(role);
}

export function isClosed(withdrawal) {
  return Boolean(withdrawal && (withdrawal.status === "paid" || withdrawal.status === "rejected"));
}

export function isQueueStatus(status) {
  return PENDING_WITHDRAWAL_STATUSES.includes(status);
}

export function normalizeWithdrawalDecision(row) {
  if (!isPlainObject(row)) return null;
  const id = uuid(row.id);
  if (!id) return null;
  const status = typeof row.status === "string" && row.status ? row.status : "requested";
  return {
    id,
    userId: uuid(row.user_id ?? row.userId),
    amountCents: cents(row.amount_cents ?? row.amountCents),
    feeCents: cents(row.fee_cents ?? row.feeCents),
    netCents: cents(row.net_cents ?? row.netCents),
    amountLabel: formatCents(row.amount_cents ?? row.amountCents),
    feeLabel: formatCents(row.fee_cents ?? row.feeCents),
    netLabel: formatCents(row.net_cents ?? row.netCents),
    provider: cleanText(row.provider, 20) || null,
    destination: cleanText(row.destination_masked ?? row.destination, 40) || null,
    status,
    statusLabel: withdrawalStatusLabel(status),
    closed: status === "paid" || status === "rejected",
    note: cleanText(row.note ?? row.decision_note, 300) || null,
    paidRef: cleanText(row.paid_ref ?? row.paidRef, 120) || null,
    requestedAt: isoDate(row.requested_at ?? row.requestedAt ?? row.created_at),
    decidedAt: isoDate(row.decided_at ?? row.decidedAt),
  };
}

export function normalizeWithdrawalsDecision(rows) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const item = normalizeWithdrawalDecision(row);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out.sort((a, b) => {
    const at = a.requestedAt ? Date.parse(a.requestedAt) : 0;
    const bt = b.requestedAt ? Date.parse(b.requestedAt) : 0;
    return bt - at;
  });
}

export function summarizeWithdrawals(rows) {
  const list = normalizeWithdrawalsDecision(rows);
  const count = (status) => list.filter((w) => w.status === status).length;
  const openList = list.filter((w) => isQueueStatus(w.status));
  return {
    count: list.length,
    requested: count("requested"),
    approved: count("approved"),
    processing: count("processing"),
    paid: count("paid"),
    rejected: count("rejected"),
    failed: count("failed"),
    openCount: openList.length,
    openCents: openList.reduce((sum, w) => sum + w.amountCents, 0),
  };
}

export function assessDecisionAccess({ moduleAvailable, role, aal } = {}) {
  if (!moduleAvailable) {
    return {
      ok: false,
      reason: "module_absent",
      title: "Les retraits ne sont pas encore activés",
      message:
        "Le portefeuille et les retraits ne sont pas installés sur le serveur. Aucune demande n'est simulée.",
    };
  }
  if (!isOwnerRole(role)) {
    return {
      ok: false,
      reason: "not_owner",
      title: "Accès réservé au propriétaire",
      message:
        "Seuls le propriétaire ou un administrateur peuvent décider d'un retrait. Le statut payé reste une preuve serveur.",
    };
  }
  if (aal !== "aal2") {
    return {
      ok: false,
      reason: "mfa_required",
      title: "Double vérification requise",
      message:
        "Le serveur exige aal2 pour décider d'un retrait. Activez la double vérification dans le QG.",
    };
  }
  return {
    ok: true,
    reason: "ready",
    title: "Décisions de retrait",
    message:
      "Approuver et passer en cours ne déplacent pas d'argent. Refuser rend integralement le montant au portefeuille et exige le mot REFUSER.",
  };
}

export function nextDecisions(withdrawal) {
  if (!withdrawal || isClosed(withdrawal)) return [];
  if (withdrawal.status === "requested") return ["approved", "processing", "failed", "rejected"];
  if (withdrawal.status === "approved") return ["processing", "failed", "rejected"];
  if (withdrawal.status === "processing") return ["failed", "rejected"];
  if (withdrawal.status === "failed") return ["approved", "processing", "rejected"];
  return [];
}

export function refundAmountCents(withdrawal) {
  if (!withdrawal || isClosed(withdrawal)) return 0;
  return withdrawal.amountCents > 0 ? withdrawal.amountCents : 0;
}

export function validateDecision({ withdrawal, status, note, confirm } = {}) {
  if (!withdrawal) return { ok: false, error: "Retrait introuvable." };
  if (!DECISIONS.includes(status)) return { ok: false, error: "Décision inconnue." };
  if (isClosed(withdrawal)) return { ok: false, error: "Ce retrait est déjà clos." };
  if (withdrawal.status === status) return { ok: false, error: "Ce retrait a déjà ce statut." };

  const clean = cleanText(note, 300);
  if (status === "rejected") {
    if (clean.length < 5) {
      return { ok: false, error: "Écrivez le motif du refus (5 caractères minimum)." };
    }
    if (String(confirm ?? "").trim() !== CONFIRM_REJECT) {
      return {
        ok: false,
        error: `Tapez exactement ${CONFIRM_REJECT} pour confirmer le retour intégral au portefeuille.`,
      };
    }
    if (refundAmountCents(withdrawal) <= 0) {
      return { ok: false, error: "Aucun montant à rendre sur ce retrait." };
    }
  }
  if (status === "failed" && clean.length < 5) {
    return { ok: false, error: "Expliquez l'échec (5 caractères minimum)." };
  }
  return { ok: true, status, note: clean || null };
}

export { formatCents, PENDING_WITHDRAWAL_STATUSES };
