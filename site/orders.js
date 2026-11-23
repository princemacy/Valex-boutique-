// VAlex - parcours de commande cote navigateur (p47).
//
// Lecture de `orders.fulfillment_state`, des preuves et des litiges par RLS.
// Ecriture uniquement par les RPC : `order_issue_otp`, `order_confirm_receipt`,
// `order_transition`, `order_add_proof`, `dispute_open`, `delivery_estimate`.
//
// Aucune liberation ni aucun remboursement n'est declenche ici : ces decisions
// restent serveur et humaines.
import {
  FULFILLMENT_LABELS,
  FULFILLMENT_STATES,
  PROOF_KINDS,
  buildConfirmParams,
  buildDisputeParams,
  buildIssueParams,
  buildProofParams,
  buildTransitionParams,
  canConfirmReceipt,
  canIssueReceipt,
  canOpenDispute,
  estimateLabel,
  fulfillmentLabel,
  isValidReceiptCode,
  normalizeCode,
  normalizeDispute,
  normalizeOrder,
  normalizeProofs,
  progressIndex,
  progressSteps,
  receiptResultMessage,
  sellerTransitions,
  transitionLabel,
  validateDispute,
  validateProof,
  validateReceiptCode,
} from "./orders-core.mjs";

function client() {
  if (typeof window === "undefined" || !window.sb) {
    throw new Error("client_indisponible");
  }
  return window.sb;
}

function missingModule(error) {
  const m = String((error && error.message) || "").toLowerCase();
  const code = String((error && error.code) || "");
  return (
    code === "42703" ||
    code === "PGRST202" ||
    m.includes("does not exist") ||
    m.includes("could not find the function") ||
    m.includes("schema cache") ||
    m.includes("pgrst202") ||
    m.includes("42703")
  );
}

// Detecte la disponibilite de p47 sans casser l'ancien site : une colonne ou
// une fonction absente renvoie `available: false` au lieu de lever.
export async function loadState(orderId) {
  const id = String(orderId ?? "").split("?")[0].trim();
  if (!id) return { available: false, order: null };
  const { data, error } = await client()
    .from("orders")
    .select("id,status,fulfillment_state,delivery_mode,buyer_id,shop_id,payment_method,payment_status")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return { available: !missingModule(error), order: null, error: error.message };
  }
  const order = normalizeOrder(data);
  return { available: Boolean(order && order.state), order };
}

export async function issueReceiptCode(orderId) {
  const { data, error } = await client().rpc(
    "order_issue_otp",
    buildIssueParams({ orderId }),
  );
  if (error) throw new Error(error.message || "code_reception_refuse");
  const code = String(data ?? "");
  if (!/^[0-9]{6}$/.test(code)) throw new Error("code_reception_invalide");
  return code;
}

export async function confirmReceipt(orderId, code) {
  const { data, error } = await client().rpc(
    "order_confirm_receipt",
    buildConfirmParams({ orderId, code }),
  );
  if (error) throw new Error(error.message || "confirmation_refusee");
  return { result: data, ...receiptResultMessage(data) };
}

export async function transition(orderId, to, note = null) {
  const { data, error } = await client().rpc(
    "order_transition",
    buildTransitionParams({ orderId, to, note }),
  );
  if (error) throw new Error(error.message || "transition_refusee");
  return data;
}

export async function addProof(orderId, { kind, storagePath, note } = {}) {
  const { data, error } = await client().rpc(
    "order_add_proof",
    buildProofParams({ orderId, kind, storagePath, note }),
  );
  if (error) throw new Error(error.message || "preuve_refusee");
  return data;
}

export async function openDispute(orderId, { reason, description } = {}) {
  const { data, error } = await client().rpc(
    "dispute_open",
    buildDisputeParams({ orderId, reason, description }),
  );
  if (error) throw new Error(error.message || "litige_refuse");
  return data;
}

export async function loadProofs(orderId) {
  const id = String(orderId ?? "").trim();
  if (!id) return [];
  const { data, error } = await client()
    .from("order_proofs")
    .select("id,kind,storage_path,note,actor_id,created_at")
    .eq("order_id", id)
    .order("created_at", { ascending: true });
  if (error) return [];
  return normalizeProofs(data);
}

export async function loadDispute(orderId) {
  const id = String(orderId ?? "").trim();
  if (!id) return null;
  const { data, error } = await client()
    .from("disputes")
    .select("id,order_id,opened_by,reason,description,status,decision,decision_note,created_at")
    .eq("order_id", id)
    .maybeSingle();
  if (error || !data) return null;
  return normalizeDispute(data);
}

export async function estimate(scope = "same") {
  const { data, error } = await client().rpc("delivery_estimate", { p_scope: scope });
  if (error) return null;
  return data;
}

export {
  FULFILLMENT_STATES,
  FULFILLMENT_LABELS,
  PROOF_KINDS,
  canConfirmReceipt,
  canIssueReceipt,
  canOpenDispute,
  estimateLabel,
  fulfillmentLabel,
  isValidReceiptCode,
  normalizeCode,
  normalizeOrder,
  progressIndex,
  progressSteps,
  receiptResultMessage,
  sellerTransitions,
  transitionLabel,
  validateDispute,
  validateProof,
  validateReceiptCode,
};
const api = {
  loadState,
  issueReceiptCode,
  confirmReceipt,
  transition,
  addProof,
  openDispute,
  loadProofs,
  loadDispute,
  estimate,
  estimateLabel,
  fulfillmentLabel,
  progressIndex,
  progressSteps,
  normalizeCode,
  sellerTransitions,
  transitionLabel,
};

if (typeof window !== "undefined") {
  window.VAlexOrders = api;
}

export default api;
