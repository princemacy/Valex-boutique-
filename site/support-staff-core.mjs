// VAlex - logique pure de la console d'assistance cote equipe (p49).
// Aucune decision financiere. Le serveur reste seul juge des droits.

import {
  BODY_MAX,
  SUPPORT_STATUS,
  categoryLabel,
  normalizeTicket,
  validateReply,
} from "./support-core.mjs";

export const STAFF_ROLES = Object.freeze(["owner", "admin", "secretary", "moderator"]);
export const ASSIGN_ROLES = Object.freeze(["owner", "admin", "secretary"]);
export const QUEUE_STATUSES = Object.freeze(["open", "in_progress"]);
export const ALL_STATUSES = Object.freeze(["open", "in_progress", "resolved", "closed"]);
export const PRIORITY_LABELS = Object.freeze({
  low: "Basse",
  normal: "Normale",
  high: "Haute",
  urgent: "Urgente",
});
export const NOTE_MAX = 2000;

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

export function priorityLabel(priority) {
  return PRIORITY_LABELS[priority] || "Normale";
}

export function isStaffRole(role) {
  return STAFF_ROLES.includes(role);
}

export function canAssignRole(role) {
  return ASSIGN_ROLES.includes(role);
}

export function canSeeTicket(role, ticket, meId) {
  if (!ticket) return false;
  if (!isStaffRole(role)) return false;
  if (role === "moderator") return Boolean(meId) && ticket.assignedTo === meId;
  return true;
}

export function normalizeAgent(row) {
  if (!isPlainObject(row)) return null;
  const id = uuid(row.id);
  if (!id) return null;
  const first = cleanText(row.first_name, 60);
  const last = cleanText(row.last_name, 60);
  const role = isStaffRole(row.role) ? row.role : null;
  const name = cleanText(`${first} ${last}`, 120);
  return {
    id,
    role,
    name: name || `Agent ${id.slice(0, 8)}`,
    blocked: Boolean(row.is_blocked),
  };
}

export function normalizeAgents(rows) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const agent = normalizeAgent(row);
    if (!agent || seen.has(agent.id)) continue;
    seen.add(agent.id);
    out.push(agent);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export function normalizeStaffTicket(row) {
  const base = normalizeTicket(row);
  if (!base) return null;
  const priority = Object.prototype.hasOwnProperty.call(PRIORITY_LABELS, row.priority)
    ? row.priority
    : "normal";
  return {
    ...base,
    requesterId: uuid(row.requester_id),
    assignedTo: uuid(row.assigned_to),
    priority,
    priorityLabel: priorityLabel(priority),
    resolvedAt: typeof row.resolved_at === "string" ? row.resolved_at : null,
  };
}

export function normalizeStaffTickets(rows) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const item = normalizeStaffTicket(row);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function filterTickets(rows, status) {
  const list = normalizeStaffTickets(rows);
  if (!status || status === "all") return list;
  if (!ALL_STATUSES.includes(status)) return list;
  return list.filter((ticket) => ticket.status === status);
}

export function summarizeTickets(rows, meId) {
  const list = normalizeStaffTickets(rows);
  const count = (status) => list.filter((t) => t.status === status).length;
  return {
    count: list.length,
    open: count("open"),
    in_progress: count("in_progress"),
    resolved: count("resolved"),
    closed: count("closed"),
    assigned: list.filter((t) => Boolean(t.assignedTo)).length,
    mine: meId ? list.filter((t) => t.assignedTo === meId).length : 0,
  };
}

export function assignmentLabel(ticket, agents, meId) {
  if (!ticket || !ticket.assignedTo) return "Non attribuée";
  if (meId && ticket.assignedTo === meId) return "Vous";
  const found = (Array.isArray(agents) ? agents : []).find((a) => a.id === ticket.assignedTo);
  if (found && found.name) return found.name;
  return `Agent ${ticket.assignedTo.slice(0, 8)}`;
}

export function nextStatuses(ticket) {
  if (!ticket || !ticket.status) return [];
  switch (ticket.status) {
    case "open":
      return ["in_progress", "resolved", "closed"];
    case "in_progress":
      return ["open", "resolved", "closed"];
    case "resolved":
      return ["open", "closed"];
    case "closed":
      return ["open"];
    default:
      return [];
  }
}

export function statusActionLabel(status) {
  switch (status) {
    case "open":
      return "Rouvrir";
    case "in_progress":
      return "Prendre en cours";
    case "resolved":
      return "Marquer résolue";
    case "closed":
      return "Fermer";
    default:
      return "Changer le statut";
  }
}

export function assessStaffAccess({ moduleAvailable, role, aal } = {}) {
  if (!moduleAvailable) {
    return {
      ok: false,
      reason: "module_absent",
      title: "L'assistance n'est pas encore activée",
      message:
        "Les demandes d'assistance ne sont pas installées sur le serveur. Aucun ticket n'est simulé.",
    };
  }
  if (!isStaffRole(role)) {
    return {
      ok: false,
      reason: "not_staff",
      title: "Accès réservé à l'équipe",
      message:
        "Seuls le propriétaire, un administrateur, le secrétariat ou un modérateur peuvent traiter les demandes.",
    };
  }
  if (aal !== "aal2") {
    return {
      ok: false,
      reason: "mfa_required",
      title: "Double vérification requise",
      message:
        "Le serveur exige aal2 pour attribuer une demande ou changer son statut. Activez la double vérification dans le QG.",
    };
  }
  return {
    ok: true,
    reason: "ready",
    title: "Assistance équipe",
    message:
      "Traiter les demandes demande une action humaine. Aucune demande n'est fermée automatiquement.",
  };
}

export function validateAssign({ ticket, agentId, role, meId } = {}) {
  if (!canAssignRole(role)) {
    return {
      ok: false,
      error: "Seuls le propriétaire, un administrateur ou le secrétariat peuvent attribuer une demande.",
    };
  }
  if (!ticket) return { ok: false, error: "Demande introuvable." };
  if (ticket.status === "resolved" || ticket.status === "closed") {
    return { ok: false, error: "Cette demande est close. Rouvrez-la avant de l'attribuer." };
  }
  if (!uuid(agentId)) return { ok: false, error: "Choisissez un agent autorisé." };
  if (meId && agentId === meId && ticket.assignedTo === meId) {
    return { ok: false, error: "Cette demande vous est déjà attribuée." };
  }
  if (ticket.assignedTo === agentId) {
    return { ok: false, error: "Cette demande est déjà attribuée à cet agent." };
  }
  return { ok: true, agentId };
}

export function validateStatus({ ticket, status, note } = {}) {
  if (!ticket) return { ok: false, error: "Demande introuvable." };
  if (!ALL_STATUSES.includes(status)) return { ok: false, error: "Statut inconnu." };
  if (ticket.status === status) return { ok: false, error: "Cette demande a déjà ce statut." };
  const clean = cleanText(note, NOTE_MAX);
  if ((status === "resolved" || status === "closed") && clean.length < 5) {
    return { ok: false, error: "Écrivez une note de clôture (5 caractères minimum)." };
  }
  return { ok: true, status, note: clean || null };
}

export function validateStaffReply({ body, internal } = {}) {
  try {
    const clean = validateReply({ body });
    return { ok: true, body: clean.body, internal: Boolean(internal) };
  } catch (_) {
    return { ok: false, error: "Écrivez un message avant d'envoyer." };
  }
}

export function statusLabelOf(status) {
  return SUPPORT_STATUS[status] || "Ouverte";
}

export { BODY_MAX, categoryLabel };
