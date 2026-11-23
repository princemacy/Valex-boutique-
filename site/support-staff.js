// VAlex - console d'assistance cote equipe (p49).
//
// Lecture par RLS : le proprietaire, le secretariat et les administrateurs
// voient les demandes autorisees ; un moderateur ne voit que les demandes
// qui lui sont attribuees. Ecriture par `support_assign`,
// `support_set_status` et `support_reply` uniquement.

import { normalizeMessages } from "./support-core.mjs";
import * as staffCore from "./support-staff-core.mjs";
import {
  ALL_STATUSES,
  QUEUE_STATUSES,
  assessStaffAccess,
  normalizeStaffTicket,
  normalizeStaffTickets,
  normalizeAgents,
} from "./support-staff-core.mjs";

const COLUMNS =
  "id,requester_id,subject,category,status,priority,assigned_to,order_id,shop_id,created_at,updated_at,resolved_at";

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
    const { error } = await sb.from("support_tickets").select("id").limit(1);
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
    access: assessStaffAccess({ moduleAvailable, role, aal }),
  };
}

export async function loadTickets({ status = "open", limit = 50 } = {}) {
  const size = clamp(limit, 50, 200);
  let query = client().from("support_tickets").select(COLUMNS);
  if (status !== "all" && ALL_STATUSES.includes(status)) {
    query = query.eq("status", status);
  }
  const queue = QUEUE_STATUSES.includes(status);
  const { data, error } = await query
    .order("created_at", { ascending: queue })
    .limit(size);
  if (error) return [];
  return normalizeStaffTickets(data);
}

export async function loadAgents() {
  try {
    const { data, error } = await client()
      .from("staff_directory")
      .select("id,role,first_name,last_name,is_blocked")
      .order("first_name", { ascending: true });
    if (error) return [];
    return normalizeAgents(data);
  } catch (_) {
    return [];
  }
}

export async function loadThread(ticketId, meId = null) {
  const id = String(ticketId ?? "").trim();
  if (!id) throw new Error("demande_introuvable");
  const sb = client();
  const head = await sb.from("support_tickets").select(COLUMNS).eq("id", id).maybeSingle();
  if (head.error || !head.data) throw new Error("demande_introuvable");
  const ticket = normalizeStaffTicket(head.data);
  if (!ticket) throw new Error("demande_introuvable");
  const messages = await sb
    .from("support_messages")
    .select("id,sender_id,body,is_internal,created_at")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });
  if (messages.error) throw new Error("assistance_indisponible");
  return {
    ticket,
    messages: normalizeMessages(messages.data, meId),
  };
}

export async function assignTicket(ticketId, agentId) {
  const { data, error } = await client().rpc("support_assign", {
    p_ticket: ticketId,
    p_agent: agentId,
  });
  if (error) throw new Error(errorText(error));
  return data;
}

export async function setStatus(ticketId, status, note = null) {
  const { data, error } = await client().rpc("support_set_status", {
    p_ticket: ticketId,
    p_status: status,
    p_note: note ?? null,
  });
  if (error) throw new Error(errorText(error));
  return data;
}

export async function replyStaff(ticketId, body, internal = false) {
  const { data, error } = await client().rpc("support_reply", {
    p_ticket: ticketId,
    p_body: body,
    p_attachment: null,
    p_internal: Boolean(internal),
  });
  if (error) throw new Error(errorText(error));
  return data;
}

export function errorText(error) {
  const m = String((error && error.message) || "");
  if (missingModule(error)) {
    return "L'assistance n'est pas installée sur le serveur.";
  }
  if (/Verification en deux etapes requise/i.test(m)) {
    return "Double vérification requise : activez-la dans le QG avant de continuer.";
  }
  if (/Acces refuse/i.test(m)) {
    return "Accès refusé. Vous ne pouvez pas traiter cette demande.";
  }
  if (/pas un agent autorise/i.test(m)) {
    return "Cet utilisateur n'est pas un agent autorisé.";
  }
  if (/Demande introuvable/i.test(m)) {
    return "Cette demande est introuvable.";
  }
  if (/close/i.test(m)) {
    return "Cette demande est close. Rouvrez-la avant de la modifier.";
  }
  if (/Statut inconnu/i.test(m)) {
    return "Statut inconnu.";
  }
  if (/Message vide/i.test(m)) {
    return "Écrivez un message avant d'envoyer.";
  }
  if (/Note interne reservee/i.test(m)) {
    return "Les notes internes sont réservées au personnel.";
  }
  return m || "L'action d'assistance a échoué.";
}

export {
  ALL_STATUSES,
  ASSIGN_ROLES,
  PRIORITY_LABELS,
  QUEUE_STATUSES,
  STAFF_ROLES,
  assessStaffAccess,
  assignmentLabel,
  canAssignRole,
  canSeeTicket,
  categoryLabel,
  filterTickets,
  isStaffRole,
  nextStatuses,
  normalizeAgent,
  normalizeAgents,
  normalizeStaffTicket,
  normalizeStaffTickets,
  priorityLabel,
  statusActionLabel,
  statusLabelOf,
  summarizeTickets,
  validateAssign,
  validateStaffReply,
  validateStatus,
  BODY_MAX,
} from "./support-staff-core.mjs";

const api = {
  loadAccess,
  loadTickets,
  loadAgents,
  loadThread,
  assignTicket,
  setStatus,
  replyStaff,
  errorText,
  assignmentLabel: staffCore.assignmentLabel,
  canAssignRole: staffCore.canAssignRole,
  categoryLabel: staffCore.categoryLabel,
  filterTickets: staffCore.filterTickets,
  nextStatuses: staffCore.nextStatuses,
  priorityLabel: staffCore.priorityLabel,
  statusActionLabel: staffCore.statusActionLabel,
  statusLabelOf: staffCore.statusLabelOf,
  summarizeTickets: staffCore.summarizeTickets,
  validateAssign: staffCore.validateAssign,
  validateStaffReply: staffCore.validateStaffReply,
  validateStatus: staffCore.validateStatus,
};

if (typeof window !== "undefined") {
  window.VAlexSupportStaff = api;
}

export default api;
