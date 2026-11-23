// VAlex - litiges cote navigateur (p47).
//
// Lecture par RLS sur `disputes`, `orders` et `shops` ; ecriture unique par
// `dispute_claim` et `dispute_decide`. Aucun remboursement n'est declenche
// ici : la decision `refund` ne fait que passer la commande en attente.
import * as disputeCore from "./dispute-core.mjs";
import {
  assessAccess,
  isOpenStatus,
  normalizeDisputes,
  sortQueue,
  sortRecent,
} from "./dispute-core.mjs";

const DISPUTE_COLUMNS =
  "id,order_id,opened_by,reason,description,status,assigned_to,decision,decision_note,decided_at,created_at,updated_at";
const ORDER_COLUMNS = "id,number,buyer_id,shop_id,total_cents,fulfillment_state";

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

function clamp(value, fallback, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return Math.min(n, max);
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

async function currentUserId() {
  const auth = client().auth;
  if (!auth) return null;
  try {
    if (typeof auth.getUser === "function") {
      const { data } = await auth.getUser();
      if (data && data.user && data.user.id) return data.user.id;
    }
    if (typeof auth.getSession === "function") {
      const { data } = await auth.getSession();
      if (data && data.session && data.session.user && data.session.user.id) {
        return data.session.user.id;
      }
    }
  } catch (_) {
    return null;
  }
  return null;
}

export async function loadAccess() {
  const sb = client();
  let moduleAvailable = false;
  try {
    const { error } = await sb.from("disputes").select("id").limit(1);
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

  let meId = null;
  try {
    meId = await currentUserId();
  } catch (_) {
    meId = null;
  }

  return {
    moduleAvailable,
    role,
    aal,
    meId,
    access: assessAccess({ moduleAvailable, role, aal }),
  };
}

// Enrichit les litiges avec le numero de commande, le montant et la boutique.
async function withOrders(rows) {
  const list = normalizeDisputes(rows);
  if (!list.length) return list;
  const orderIds = [...new Set(list.map((d) => d.orderId).filter(Boolean))];
  let orders = [];
  try {
    const { data, error } = await client().from("orders").select(ORDER_COLUMNS).in("id", orderIds);
    if (!error) orders = data || [];
  } catch (_) {
    orders = [];
  }
  const orderById = {};
  for (const o of orders) {
    if (o && o.id) orderById[o.id] = o;
  }
  const shopIds = [...new Set(Object.values(orderById).map((o) => o.shop_id).filter(Boolean))];
  let shops = [];
  if (shopIds.length) {
    try {
      const { data, error } = await client().from("shops").select("id,name").in("id", shopIds);
      if (!error) shops = data || [];
    } catch (_) {
      shops = [];
    }
  }
  const shopById = {};
  for (const s of shops) {
    if (s && s.id) shopById[s.id] = s.name;
  }
  return list.map((d) => {
    const o = orderById[d.orderId];
    if (!o) return d;
    return {
      ...d,
      orderNumber: o.number || null,
      orderTotalCents: Number(o.total_cents) || 0,
      orderTotalLabel: disputeCore.formatCents(Number(o.total_cents) || 0),
      orderState: o.fulfillment_state || null,
      shopId: o.shop_id || null,
      shopName: shopById[o.shop_id] || null,
    };
  });
}

export async function loadQueue({ limit = 100 } = {}) {
  const size = clamp(limit, 100, 200);
  const { data, error } = await client()
    .from("disputes")
    .select(DISPUTE_COLUMNS)
    .in("status", ["open", "under_review"])
    .order("created_at", { ascending: true })
    .limit(size);
  if (error) return [];
  return sortQueue(await withOrders(data));
}

export async function loadRecent({ limit = 30 } = {}) {
  const size = clamp(limit, 30, 100);
  const { data, error } = await client()
    .from("disputes")
    .select(DISPUTE_COLUMNS)
    .in("status", ["resolved", "rejected"])
    .order("updated_at", { ascending: false })
    .limit(size);
  if (error) return [];
  return sortRecent(await withOrders(data));
}

export async function claim(disputeId) {
  const { data, error } = await client().rpc("dispute_claim", { p_dispute: disputeId });
  if (error) throw new Error(errorText(error));
  return data;
}

export async function decide(disputeId, decision, note) {
  const { data, error } = await client().rpc("dispute_decide", {
    p_dispute: disputeId,
    p_decision: decision,
    p_note: note,
  });
  if (error) throw new Error(errorText(error));
  return data;
}

export function errorText(error) {
  const m = String((error && error.message) || "");
  if (missingModule(error)) {
    return "Les litiges ne sont pas installés sur le serveur.";
  }
  if (/Verification en deux etapes requise/i.test(m)) {
    return "Double vérification requise : activez-la dans le QG avant de continuer.";
  }
  if (/Acces refuse/i.test(m)) {
    return "Accès refusé. Seul le propriétaire, un administrateur ou un modérateur peut agir.";
  }
  if (/Litige introuvable/i.test(m)) {
    return "Ce litige est introuvable.";
  }
  if (/deja clos/i.test(m)) {
    return "Ce litige est déjà clos.";
  }
  if (/Decision inconnue/i.test(m)) {
    return "Décision inconnue.";
  }
  if (/justification ecrite/i.test(m)) {
    return "Écrivez une justification de 10 caractères minimum.";
  }
  return m || "L'action sur le litige a échoué.";
}

export {
  CONFIRM_RELEASE,
  DECISIONS,
  DECISION_LABELS,
  DECISION_NOTICES,
  DISPUTE_ROLES,
  NOTE_MIN,
  OPEN_STATUSES,
  assessAccess,
  canClaim,
  decisionLabel,
  decisionNotice,
  disputeStatusLabel,
  formatCents,
  isClosed,
  isDisputeRole,
  isOpenStatus,
  movesMoney,
  nextDecisions,
  normalizeDispute,
  normalizeDisputes,
  orderStateLabel,
  sortQueue,
  sortRecent,
  summarizeDisputes,
  validateClaim,
  validateDecision,
} from "./dispute-core.mjs";

const api = {
  loadAccess,
  loadQueue,
  loadRecent,
  claim,
  decide,
  errorText,
  canClaim: disputeCore.canClaim,
  decisionLabel: disputeCore.decisionLabel,
  decisionNotice: disputeCore.decisionNotice,
  formatCents: disputeCore.formatCents,
  movesMoney: disputeCore.movesMoney,
  nextDecisions: disputeCore.nextDecisions,
  orderStateLabel: disputeCore.orderStateLabel,
  summarizeDisputes: disputeCore.summarizeDisputes,
  validateClaim: disputeCore.validateClaim,
  validateDecision: disputeCore.validateDecision,
  CONFIRM_RELEASE: disputeCore.CONFIRM_RELEASE,
  NOTE_MIN: disputeCore.NOTE_MIN,
};

if (typeof window !== "undefined") {
  window.VAlexDisputes = api;
}

export default api;
