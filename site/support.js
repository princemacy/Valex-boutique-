// VAlex - assistance cote navigateur (p49, etendu p59).
//
// Lecture par RLS sur `support_tickets` et `support_messages`; ecriture par
// les RPC `support_open`, `support_reply` et `support_escalate_ai`. Aucune
// demande n'est inventee : si le serveur ne possede pas encore une fonction,
// l'appel echoue et l'interface le dit clairement.
import {
  attachmentPath,
  detectLanguage,
  isHumanRequest,
  normalizeMessages,
  normalizeTicket,
  normalizeTickets,
  priorityLabel,
  validateAttachment,
  validateEscalation,
  validateOpen,
  validateReply,
} from "./support-core.mjs";

const ATTACHMENT_BUCKET = "support-attachments";

function client() {
  if (typeof window === "undefined" || !window.sb) {
    throw new Error("client_indisponible");
  }
  return window.sb;
}

function cleanLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 30;
  return Math.max(1, Math.min(100, Math.floor(n)));
}

function missingFunction(error) {
  const code = String((error && error.code) || "");
  const m = String((error && error.message) || "").toLowerCase();
  return (
    code === "42883" ||
    code === "PGRST202" ||
    m.includes("could not find the function") ||
    m.includes("schema cache") ||
    m.includes("does not exist")
  );
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
      if (data && data.session && data.session.user) return data.session.user.id;
    }
  } catch (_) {
    return null;
  }
  return null;
}

export async function listTickets(limit = 30) {
  const { data, error } = await client()
    .from("support_tickets")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(cleanLimit(limit));
  if (error) throw new Error("assistance_indisponible");
  return normalizeTickets(data);
}

export async function openTicket({ subject, category, body, orderId, shopId } = {}) {
  const clean = validateOpen({ subject, category, body });
  const { data, error } = await client().rpc("support_open", {
    p_subject: clean.subject,
    p_category: clean.category,
    p_body: clean.body,
    p_order: orderId || null,
    p_shop: shopId || null,
  });
  if (error) throw new Error(error.message || "demande_refusee");
  return data;
}

export async function loadTicket(id, meId = null) {
  const ticketId = String(id ?? "").trim();
  if (!ticketId) throw new Error("demande_introuvable");
  const [head, messages] = await Promise.all([
    client()
      .from("support_tickets")
      .select("*")
      .eq("id", ticketId)
      .maybeSingle(),
    client()
      .from("support_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true }),
  ]);
  if (head.error || !head.data) throw new Error("demande_introuvable");
  const ticket = normalizeTicket(head.data);
  if (!ticket) throw new Error("demande_introuvable");
  return {
    ticket,
    messages: messages.error ? [] : normalizeMessages(messages.data, meId),
  };
}

export async function reply(ticketId, body, attachment = null) {
  const id = String(ticketId ?? "").trim();
  if (!id) throw new Error("demande_introuvable");
  const clean = validateReply({ body });
  const { data, error } = await client().rpc("support_reply", {
    p_ticket: id,
    p_body: clean.body,
    p_attachment: attachment || null,
    p_internal: false,
  });
  if (error) throw new Error(error.message || "reponse_refusee");
  return data;
}

export async function escalateToHuman(ticketId, { transcript, language, priority } = {}) {
  const id = String(ticketId ?? "").trim();
  if (!id) throw new Error("demande_introuvable");
  const clean = validateEscalation({ transcript, language, priority });
  const { data, error } = await client().rpc("support_escalate_ai", {
    p_ticket: id,
    p_transcript: clean.transcript,
    p_language: clean.language,
    p_priority: clean.priority,
  });
  if (error) {
    const err = new Error(error.message || "transfert_refuse");
    err.missing = missingFunction(error);
    throw err;
  }
  return data;
}

export async function uploadAttachment(ticketId, file) {
  const id = String(ticketId ?? "").trim();
  if (!id) throw new Error("demande_introuvable");
  const userId = await currentUserId();
  if (!userId) throw new Error("connexion_requise");
  const clean = validateAttachment(file);
  const path = attachmentPath(id, userId, file);
  const { error } = await client()
    .storage.from(ATTACHMENT_BUCKET)
    .upload(path, file, { contentType: clean.type, upsert: false });
  if (error) throw new Error("piece_jointe_refusee");
  return path;
}

export async function signedAttachmentUrl(path) {
  const clean = String(path ?? "").trim();
  if (!clean) return null;
  const { data, error } = await client()
    .storage.from(ATTACHMENT_BUCKET)
    .createSignedUrl(clean, 600);
  if (error || !data) return null;
  return data.signedUrl || null;
}

export {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_EXTENSIONS,
  attachmentPath,
  categoryLabel,
  detectLanguage,
  isHumanRequest,
  normalizeMessages,
  normalizeTicket,
  normalizeTickets,
  priorityLabel,
  statusLabel,
  ticketHref,
  validateAttachment,
  validateEscalation,
  validateOpen,
  validateReply,
} from "./support-core.mjs";

const api = {
  listTickets,
  openTicket,
  loadTicket,
  reply,
  escalateToHuman,
  isHumanRequest,
  uploadAttachment,
  signedAttachmentUrl,
};

if (typeof window !== "undefined") {
  window.VAlexSupport = api;
}

export default api;
