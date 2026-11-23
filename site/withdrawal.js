// VAlex - decisions de retrait cote navigateur (p46).
//
// MODULE HISTORIQUE NON CHARGE par le site depuis p59. La console de retrait
// a ete retiree et les RPC client sont revoquees par p59. Ne pas le
// rebrancher sans une decision explicite et une nouvelle validation serveur.
//
// Lecture de `withdrawal_requests` par RLS proprietaire ; ecriture unique
// par `withdrawal_decide`. Aucun versement reel n'est declenche ici et le
// statut `paid` n'est pas propose.

import { PENDING_WITHDRAWAL_STATUSES } from "./finance-core.mjs";
import * as wdCore from "./withdrawal-core.mjs";
import {
  assessDecisionAccess,
  normalizeWithdrawalsDecision,
  refundAmountCents,
  summarizeWithdrawals,
  validateDecision,
} from "./withdrawal-core.mjs";

const COLUMNS =
  "id,user_id,amount_cents,fee_cents,net_cents,provider,destination_masked,status,requested_at,decided_by,decided_at,paid_ref,note";

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
    const { error } = await sb.from("withdrawal_requests").select("id").limit(1);
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

  let role = null;
  try {
    const { data, error } = await sb.rpc("current_staff_role");
    if (!error && typeof data === "string") role = data;
  } catch (_) {
    role = null;
  }
  if (!role) {
    try {
      const { data, error } = await sb.rpc("is_admin");
      if (!error && data === true) role = "admin";
    } catch (_) {
      role = null;
    }
  }

  return {
    moduleAvailable,
    role,
    aal,
    access: assessDecisionAccess({ moduleAvailable, role, aal }),
  };
}

export async function loadQueue({ limit = 100 } = {}) {
  const size = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 100;
  const { data, error } = await client()
    .from("withdrawal_requests")
    .select(COLUMNS)
    .in("status", [...PENDING_WITHDRAWAL_STATUSES])
    .order("requested_at", { ascending: true })
    .limit(size);
  if (error) return [];
  return normalizeWithdrawalsDecision(data);
}

export async function loadRecent({ limit = 30 } = {}) {
  const size = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 30;
  const { data, error } = await client()
    .from("withdrawal_requests")
    .select(COLUMNS)
    .order("requested_at", { ascending: false })
    .limit(size);
  if (error) return [];
  return normalizeWithdrawalsDecision(data);
}

export async function decide(id, status, note = null) {
  const { data, error } = await client().rpc("withdrawal_decide", {
    p_id: id,
    p_status: status,
    p_ref: null,
    p_note: note ?? null,
  });
  if (error) throw new Error(errorText(error));
  return data;
}

export function errorText(error) {
  const m = String((error && error.message) || "");
  if (missingModule(error)) {
    return "Les retraits ne sont pas installés sur le serveur.";
  }
  if (/Verification en deux etapes requise/i.test(m)) {
    return "Double vérification requise : activez-la dans le QG avant de continuer.";
  }
  if (/Acces refuse/i.test(m)) {
    return "Accès refusé. Seul le propriétaire ou un administrateur peut décider.";
  }
  if (/Retrait introuvable/i.test(m)) {
    return "Ce retrait est introuvable.";
  }
  if (/deja clos/i.test(m)) {
    return "Ce retrait est déjà clos.";
  }
  if (/Statut de retrait inconnu/i.test(m)) {
    return "Statut de retrait inconnu.";
  }
  return m || "La décision de retrait a échoué.";
}

export {
  CONFIRM_REJECT,
  DECISIONS,
  DECISION_ROLES,
  PAID_NOTICE,
  assessDecisionAccess,
  decisionLabel,
  formatCents,
  isClosed,
  isOwnerRole,
  nextDecisions,
  normalizeWithdrawalDecision,
  normalizeWithdrawalsDecision,
  refundAmountCents,
  summarizeWithdrawals,
  validateDecision,
} from "./withdrawal-core.mjs";

const api = {
  loadAccess,
  loadQueue,
  loadRecent,
  decide,
  errorText,
  CONFIRM_REJECT: wdCore.CONFIRM_REJECT,
  PAID_NOTICE: wdCore.PAID_NOTICE,
  assessDecisionAccess: wdCore.assessDecisionAccess,
  decisionLabel: wdCore.decisionLabel,
  formatCents: wdCore.formatCents,
  isOwnerRole: wdCore.isOwnerRole,
  nextDecisions: wdCore.nextDecisions,
  normalizeWithdrawalsDecision: wdCore.normalizeWithdrawalsDecision,
  refundAmountCents: wdCore.refundAmountCents,
  summarizeWithdrawals: wdCore.summarizeWithdrawals,
  validateDecision: wdCore.validateDecision,
};

if (typeof window !== "undefined") {
  window.VAlexWithdrawals = api;
}

export default api;
