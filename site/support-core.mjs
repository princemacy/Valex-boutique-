// VAlex - logique pure de l'assistance (p49).
// Aucun acces reseau, aucun contenu invente.
//
// Contrat p49 :
//   - `support_open(sujet, categorie, corps, commande, boutique)` cree une
//     demande et son premier message ;
//   - `support_reply(ticket, corps, piece, interne)` ajoute un message ;
//   - `support_tickets` et `support_messages` sont lisibles par le demandeur
//     via RLS ; une note interne n'est jamais renvoyee a un non-staff.

export const SUPPORT_CATEGORIES = Object.freeze([
  ["account", "Compte"],
  ["order", "Commande"],
  ["payment", "Paiement"],
  ["delivery", "Livraison"],
  ["ad", "Publicite"],
  ["other", "Autre"],
]);

export const SUPPORT_STATUS = Object.freeze({
  open: "Ouverte",
  in_progress: "En cours",
  resolved: "Resolue",
  closed: "Fermee",
});

export const SUBJECT_MAX = 120;
export const BODY_MAX = 2000;

const CATEGORY_KEYS = SUPPORT_CATEGORIES.map(([key]) => key);
const STATUS_KEYS = Object.keys(SUPPORT_STATUS);

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

function validDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function uuid(value) {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

export function categoryLabel(category) {
  const found = SUPPORT_CATEGORIES.find(([key]) => key === category);
  return found ? found[1] : "Autre";
}

export function statusLabel(status) {
  return SUPPORT_STATUS[status] || "Ouverte";
}

export function validateOpen({ subject, category, body } = {}) {
  const cleanSubject = cleanText(subject, SUBJECT_MAX);
  if (cleanSubject.length < 3) throw new Error("sujet_assistance_trop_court");
  const cat = CATEGORY_KEYS.includes(category) ? category : "other";
  const cleanMessage = cleanBody(body, BODY_MAX);
  return { subject: cleanSubject, category: cat, body: cleanMessage || null };
}

export function validateReply({ body } = {}) {
  const cleanMessage = cleanBody(body, BODY_MAX);
  if (!cleanMessage) throw new Error("message_assistance_vide");
  return { body: cleanMessage };
}

export const PRIORITY_LABELS = Object.freeze({
  low: "Basse",
  normal: "Normale",
  high: "Haute",
  urgent: "Urgente",
});

export const PRIORITY_KEYS = Object.keys(PRIORITY_LABELS);

export function priorityLabel(priority) {
  return PRIORITY_LABELS[priority] || "Normale";
}

// Detection volontairement simple et explicable : on ne devine pas la langue
// d'apres le navigateur, on regarde les mots reellement ecrits. Un texte sans
// marqueur creole reste en francais.
const HT_MARKERS = new Set([
  "mwen", "m", "ou", "w", "li", "nou", "n", "yo", "kijan", "koman", "kòman",
  "poukisa", "pouki", "ki", "kisa", "kiyès", "kile", "kote", "kot", "sak",
  "pa", "poko", "deja", "toujou", "jan", "janm", "gen", "genyen", "genlè",
  "ka", "kapab", "dwe", "vle", "bezwen", "fè", "fe", "al", "ale", "vini",
  "pale", "di", "mande", "reponn", "ede", "mèsi", "mesi", "bonjou", "bonswa",
  "orevwa", "souple", "tanpri", "eskize", "padon", "moun", "ajan", "kliyan",
  "vandè", "vande", "boutik", "machandiz", "komann", "kòmand", "livrezon",
  "livrezon", "peman", "lajan", "kòb", "kob", "pri", "priz", "pwodwi",
  "bagay", "pwoblèm", "pwoblem", "kesyon", "enfo", "imèl", "imeil",
  "kòmantè", "komante", "avì", "avi", "kont", "kat", "adrès", "adres",
  "vil", "peyi", "ayiti", "haiti", "kreyòl", "kreyol", "frè", "fre",
  "sè", "se", "piti", "gran", "nouvo", "ansyen", "jodi", "demen", "yè",
  "ye", "kounye", "kounyea", "main", "mande", "resevwa", "rès", "res",
]);

export function detectLanguage(text) {
  const words = String(text ?? "")
    .toLowerCase()
    .replace(/[^a-zà-ÿ']/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  let ht = 0;
  let fr = 0;
  const FR_MARKERS = new Set([
    "je", "j", "tu", "il", "elle", "nous", "vous", "ils", "elles", "le",
    "la", "les", "un", "une", "des", "du", "de", "est", "sont", "ai",
    "as", "avons", "avez", "ont", "suis", "es", "sommes", "êtes", "sont",
    "pourquoi", "comment", "quand", "où", "quel", "quelle", "quels",
    "quelles", "merci", "bonjour", "bonsoir", "au", "aux", "ce", "cette",
    "ces", "mon", "ma", "mes", "votre", "vos", "notre", "nos", "avec",
    "sans", "pour", "dans", "sur", "pas", "plus", "moins", "très", "être",
    "avoir", "faire", "dit", "demande", "répondre", "aider", "client",
    "vendeur", "boutique", "commande", "livraison", "paiement", "argent",
    "prix", "produit", "chose", "problème", "question", "compte", "email",
    "adresse", "ville", "pays", "haïti", "créole", "français",
  ]);
  for (const word of words) {
    if (HT_MARKERS.has(word)) ht += 1;
    if (FR_MARKERS.has(word)) fr += 1;
  }
  if (ht >= 2 && ht > fr) return "ht";
  if (ht >= 1 && fr === 0) return "ht";
  return "fr";
}

export function isHumanRequest(text) {
  const t = String(text ?? "").toLowerCase();
  return /(parler\s+(à|a)\s+(un\s+)?humain|un\s+humain|une?\s+vraie?\s+personne|quelqu'un|quelqu’un|un\s+agent|une\s+agente|conseiller|conseillère|service\s+client|pale\s+ak\s+(yon\s+)?moun|yon\s+moun|moun\s+reyèl|moun\s+reyel|ajan\s+imèn|ajan\s+imen|ajan)/i.test(t);
}

export function validateEscalation({ transcript, language, priority } = {}) {
  if (transcript != null && !Array.isArray(transcript)) {
    throw new Error("transcription_invalide");
  }
  const source = Array.isArray(transcript) ? transcript : [];
  const clean = [];
  for (const item of source.slice(-60)) {
    if (!isPlainObject(item)) throw new Error("transcription_invalide");
    if (item.role === "system") continue;
    const role = item.role === "assistant" ? "assistant" : item.role === "user" ? "user" : null;
    if (!role) throw new Error("transcription_invalide");
    const content = cleanBody(item.content, 4000);
    if (!content) continue;
    clean.push({ role, content });
  }
  const lang = language === "ht" ? "ht" : "fr";
  const prio = PRIORITY_KEYS.includes(priority) ? priority : null;
  return { transcript: clean, language: lang, priority: prio };
}

export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_TYPES = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "text/plain": "txt",
});
export const ATTACHMENT_EXTENSIONS = Object.freeze(["jpg", "jpeg", "png", "webp", "pdf", "txt"]);

export function validateAttachment(file) {
  if (!file || typeof file !== "object") throw new Error("piece_jointe_absente");
  const size = Number(file.size);
  if (!Number.isFinite(size) || size <= 0) throw new Error("piece_jointe_vide");
  if (size > ATTACHMENT_MAX_BYTES) throw new Error("piece_jointe_trop_lourde");
  const rawName = String(file.name || "fichier");
  const base = rawName.split(/[\\/]/).pop() || "fichier";
  const m = base.match(/\.([A-Za-z0-9]+)$/);
  const ext = (m ? m[1] : "").toLowerCase();
  if (!ATTACHMENT_EXTENSIONS.includes(ext)) throw new Error("piece_jointe_format_refuse");
  const type = String(file.type || "").toLowerCase();
  if (type && !Object.prototype.hasOwnProperty.call(ATTACHMENT_TYPES, type)) {
    throw new Error("piece_jointe_format_refuse");
  }
  const stem = base
    .slice(0, m ? base.length - m[0].length : base.length)
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.-]+/, "")
    .slice(0, 80) || "fichier";
  return { name: `${stem}.${ext}`, ext, type: type || Object.keys(ATTACHMENT_TYPES).find((k) => ATTACHMENT_TYPES[k] === ext) || "application/octet-stream", size };
}

export function attachmentPath(ticketId, userId, file) {
  const ticket = uuid(ticketId);
  const user = uuid(userId);
  const clean = validateAttachment(file);
  if (!ticket || !user) throw new Error("piece_jointe_invalide");
  return `${ticket}/${user}/${Date.now()}-${clean.name}`;
}

export function normalizeTicket(row) {
  if (!isPlainObject(row)) return null;
  const id = uuid(row.id);
  if (!id) return null;
  const subject = cleanText(row.subject, SUBJECT_MAX);
  if (!subject) return null;
  const category = CATEGORY_KEYS.includes(row.category) ? row.category : "other";
  const status = STATUS_KEYS.includes(row.status) ? row.status : "open";
  const priority = PRIORITY_KEYS.includes(row.priority) ? row.priority : "normal";
  return {
    id,
    subject,
    category,
    categoryLabel: categoryLabel(category),
    status,
    statusLabel: statusLabel(status),
    priority,
    priorityLabel: priorityLabel(priority),
    source: row.source === "ai" ? "ai" : "user",
    language: row.language === "ht" ? "ht" : "fr",
    assignedTo: uuid(row.assigned_to),
    orderId: uuid(row.order_id),
    shopId: uuid(row.shop_id),
    createdAt: validDate(row.created_at),
    updatedAt: validDate(row.updated_at),
    escalatedAt: validDate(row.escalated_at),
    firstResponseAt: validDate(row.first_response_at),
    slaDueAt: validDate(row.sla_due_at),
  };
}

export function normalizeTickets(rows) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const item = normalizeTicket(row);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function normalizeMessage(row, meId = null) {
  if (!isPlainObject(row)) return null;
  const body = cleanBody(row.body, BODY_MAX);
  if (!body) return null;
  const id = String(row.id ?? "").trim();
  if (!id) return null;
  const attachment = typeof row.attachment_path === "string" && row.attachment_path.trim()
    ? row.attachment_path.trim().slice(0, 300)
    : null;
  const authorKind = ["user", "agent", "ai", "system"].includes(row.author_kind)
    ? row.author_kind
    : "user";
  return {
    id,
    body,
    mine: Boolean(meId) && row.sender_id === meId,
    internal: Boolean(row.is_internal),
    authorKind,
    aiGenerated: Boolean(row.ai_generated) || authorKind === "ai",
    attachment,
    createdAt: validDate(row.created_at),
  };
}

export function normalizeMessages(rows, meId = null) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const item = normalizeMessage(row, meId);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function ticketHref(id) {
  const ticket = uuid(id);
  return ticket ? "#/assistance/" + ticket : null;
}

// Resolution locale identique a `can_access_ticket` cote serveur, utile pour
// decider d'afficher un onglet. Le serveur reste seul juge.
export function canSeeStaffTools(role) {
  return role === "owner" || role === "admin" || role === "secretary" ||
    role === "moderator";
}
