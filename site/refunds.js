// VAlex - console de remboursements cote navigateur (p51, owner + aal2).
//
// La page lit `refunds` et `payment_intents` par RLS. Les seules RPC de
// mouvement sont `refund_request`, `refund_decide` et `refund_complete`,
// toutes protegees cote serveur. Aucune execution automatique.
import {
  CONFIRM_WORD,
  COMPLETABLE_STATUSES,
  DECIDABLE_STATUSES,
  assessBuyerRefundsAccess,
  assessRefundsAccess,
  buyerRefundNote,
  buyerRefundSteps,
  formatCents,
  idempotencyKey,
  normalizeIntent,
  normalizeQuote,
  normalizeRefund,
  normalizeRefunds,
  paymentStatusLabel,
  providerLabel,
  refundStatusLabel,
  sumRefunds,
  validateCompletion,
  validateDecision,
  validateRequest,
} from "./refunds-core.mjs";

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
    const { error } = await sb.from("refunds").select("id").limit(1);
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

  let isOwner = false;
  try {
    const { data, error } = await sb.rpc("is_owner");
    if (!error) isOwner = data === true;
  } catch (_) {
    isOwner = false;
  }
  if (!isOwner) {
    try {
      const { data, error } = await sb.rpc("is_admin");
      if (!error) isOwner = data === true;
    } catch (_) {
      isOwner = false;
    }
  }

  return {
    moduleAvailable,
    isOwner,
    aal,
    access: assessRefundsAccess({ moduleAvailable, isOwner, aal }),
  };
}

const INTENT_COLUMNS =
  "id,order_id,provider,provider_ref,amount_cents,currency,status,created_at";

export async function loadRefunds({ limit = 100 } = {}) {
  const sb = client();
  const size = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 100;
  const { data: refunds, error } = await sb
    .from("refunds")
    .select(
      "id,payment_intent_id,order_id,amount_cents,fee_cents,net_cents,status,reason,provider_ref,created_at,decided_at,completed_at",
    )
    .order("created_at", { ascending: false })
    .limit(size);
  if (error) return [];

  const ids = [...new Set((refunds || []).map((r) => r.payment_intent_id).filter(Boolean))];
  let intents = [];
  if (ids.length) {
    const result = await sb.from("payment_intents").select(INTENT_COLUMNS).in("id", ids);
    if (!result.error) intents = result.data || [];
  }
  return normalizeRefunds(refunds, intents);
}

/* Cote acheteur : la RLS de p51 ne renvoie que les remboursements des
   commandes de l'utilisateur connecte. Aucun filtre d'identite cote client. */
export async function loadMyRefunds({ limit = 50 } = {}) {
  return loadRefunds({ limit });
}

export async function loadBuyerAccess({ signedIn = false } = {}) {
  const sb = client();
  let moduleAvailable = false;
  try {
    const { error } = await sb.from("refunds").select("id").limit(1);
    moduleAvailable = !error || !missingModule(error);
  } catch (_) {
    moduleAvailable = false;
  }
  return {
    moduleAvailable,
    signedIn: Boolean(signedIn),
    access: assessBuyerRefundsAccess({ moduleAvailable, signedIn: Boolean(signedIn) }),
  };
}

export async function loadPaidIntents({ limit = 50 } = {}) {
  const sb = client();
  const size = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 50;
  const { data, error } = await sb
    .from("payment_intents")
    .select(INTENT_COLUMNS)
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(size);
  if (error) return [];
  return (data || []).map(normalizeIntent).filter(Boolean);
}

export async function quote(intentId, amountCents) {
  const { data, error } = await client().rpc("refund_quote", {
    p_intent: intentId,
    p_amount_cents: amountCents,
  });
  if (error) throw new Error(errorText(error));
  const result = normalizeQuote(data);
  if (!result) throw new Error("Devis de remboursement illisible. Aucun remboursement n'est créé.");
  return result;
}

export async function requestRefund({ intentId, amountCents, reason, key }) {
  const cleanKey = idempotencyKey(key);
  if (!cleanKey) throw new Error("Clé d'idempotence invalide. Réessayez.");
  const { data, error } = await client().rpc("refund_request", {
    p_intent: intentId,
    p_amount_cents: amountCents,
    p_reason: reason,
    p_idempotency_key: cleanKey,
  });
  if (error) throw new Error(errorText(error));
  return data;
}

export async function decideRefund({ refundId, decision, note }) {
  const { data, error } = await client().rpc("refund_decide", {
    p_refund: refundId,
    p_decision: decision,
    p_note: note,
  });
  if (error) throw new Error(errorText(error));
  return data;
}

export async function completeRefund({ refundId, providerRef, restoreValex, restoreKobara }) {
  const { data, error } = await client().rpc("refund_complete", {
    p_refund: refundId,
    p_provider_ref: providerRef,
    p_restore_initial_valex: Boolean(restoreValex),
    p_restore_kobara: Boolean(restoreKobara),
  });
  if (error) throw new Error(errorText(error));
  return data;
}

export function newIdempotencyKey() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch (_) {
    /* continue */
  }
  try {
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return "rmb-" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch (_) {
    /* continue */
  }
  return "rmb-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

export function errorText(error) {
  const m = String((error && error.message) || "");
  if (missingModule(error)) {
    return "Les remboursements ne sont pas installés sur le serveur.";
  }
  if (/Verification en deux etapes requise/i.test(m)) {
    return "Double vérification requise : activez-la dans le QG avant de continuer.";
  }
  if (/Acces refuse/i.test(m)) {
    return "Accès refusé. Seul le propriétaire avec double vérification peut agir.";
  }
  if (/Justification ecrite requise/i.test(m)) {
    return "Écrivez une justification d'au moins 10 caractères.";
  }
  if (/Remboursement partiel/i.test(m)) {
    return "Remboursement partiel refusé : un arbitrage manuel est requis.";
  }
  if (/Fonds deja liberes|Fonds déjà libérés/i.test(m)) {
    return "Les fonds ne sont plus bloqués : le remboursement exige un arbitrage du propriétaire.";
  }
  if (/Paiement non encaisse|Ce paiement n'est pas encaisse/i.test(m)) {
    return "Le paiement n'est pas encaissé ou il est déjà remboursé.";
  }
  const max = m.match(/Montant remboursable insuffisant \(maximum (\d+) centimes\)/i);
  if (max) {
    return `Montant remboursable insuffisant. Maximum : ${formatCents(Number(max[1]))}.`;
  }
  if (/Motif de remboursement requis/i.test(m)) {
    return "Écrivez le motif du remboursement (5 caractères minimum).";
  }
  if (/Cle d'idempotence invalide/i.test(m)) {
    return "Clé d'idempotence invalide. Réessayez.";
  }
  if (/Ce remboursement est deja traite/i.test(m)) {
    return "Ce remboursement est déjà traité.";
  }
  return m || "L'opération de remboursement a échoué.";
}

export {
  CONFIRM_WORD,
  COMPLETABLE_STATUSES,
  DECIDABLE_STATUSES,
  assessBuyerRefundsAccess,
  assessRefundsAccess,
  buyerRefundNote,
  buyerRefundSteps,
  formatCents,
  normalizeIntent,
  normalizeQuote,
  normalizeRefund,
  normalizeRefunds,
  paymentStatusLabel,
  providerLabel,
  refundStatusLabel,
  sumRefunds,
  validateCompletion,
  validateDecision,
  validateRequest,
} from "./refunds-core.mjs";

const api = {
  loadAccess,
  loadBuyerAccess,
  loadMyRefunds,
  loadRefunds,
  loadPaidIntents,
  quote,
  requestRefund,
  decideRefund,
  completeRefund,
  newIdempotencyKey,
  errorText,
  formatCents,
  refundStatusLabel,
  paymentStatusLabel,
  providerLabel,
  assessBuyerRefundsAccess,
  buyerRefundSteps,
  buyerRefundNote,
};

if (typeof window !== "undefined") {
  window.VAlexRefunds = api;
}

export default api;
