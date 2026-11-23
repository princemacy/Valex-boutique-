// VAlex - logique pure du QG (p45 : roles, MFA, journal de securite).
// Aucun acces reseau, aucun contenu invente.
//
// Contrat p45 :
//   - `current_aal()` renvoie 'aal1' ou 'aal2' selon le JWT ;
//   - `is_admin()` exige le role admin/owner ET `aal2` ;
//   - `current_staff_role()` renvoie le role du membre connecte ;
//   - `staff_directory` et `security_events` sont filtres par RLS ;
//   - AUCUNE fonction n'attribue de role depuis le client. Le changement de
//     role reste une operation serveur, jamais proposee par cette page.
//
// L'enrolement TOTP utilise l'API MFA de Supabase Auth, cote navigateur :
// `mfa.enroll`, `mfa.challenge`, `mfa.verify`, `mfa.unenroll`.

export const ROLE_LABELS = Object.freeze({
  admin: "Administrateur",
  owner: "Propriétaire",
  developer: "Développeur",
  moderator: "Modérateur",
  secretary: "Secrétariat",
  seller: "Vendeur",
  buyer: "Acheteur",
});

// Roles qui ouvrent le QG. `admin` historique reste equivalent a `owner`.
export const STAFF_ROLES = Object.freeze([
  "owner",
  "admin",
  "developer",
  "moderator",
  "secretary",
]);

export const ROLE_PRIORITY = Object.freeze({
  owner: 0,
  admin: 1,
  developer: 2,
  moderator: 3,
  secretary: 4,
});

export const AAL_LABELS = Object.freeze({
  aal1: "Mot de passe seul",
  aal2: "Double vérification active",
});

export const SEVERITY_LABELS = Object.freeze({
  info: "Information",
  warning: "Avertissement",
  critical: "Critique",
});

export const SEVERITY_ORDER = Object.freeze({
  critical: 0,
  warning: 1,
  info: 2,
});

export const EVENT_LABELS = Object.freeze({
  dispute_opened: "Litige ouvert",
  dispute_claimed: "Litige pris en charge",
  dispute_decided: "Litige tranché",
  order_otp_failed: "Code de réception refusé",
  withdrawal_decision: "Décision de retrait",
  storage_policy_changed: "Quota de stockage modifié",
  refund_approved: "Remboursement approuvé",
  refund_rejected: "Remboursement refusé",
  refund_completed: "Remboursement terminé",
});

export const EVENT_PAGE_SIZE = 25;

// Phrase affichee partout ou le client pourrait laisser croire qu'il attribue
// un role. Elle documente une limite reelle du produit.
export const ROLE_ASSIGNMENT_NOTICE =
  "L'attribution des rôles se fait uniquement côté serveur, par le propriétaire. Cette page ne peut pas modifier un rôle.";

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

function isoDate(value) {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

export function roleLabel(role) {
  return ROLE_LABELS[role] || "Rôle inconnu";
}

export function isStaffRole(role) {
  return STAFF_ROLES.includes(role);
}

export function rolePriority(role) {
  const p = ROLE_PRIORITY[role];
  return Number.isInteger(p) ? p : STAFF_ROLES.length;
}

export function normalizeAal(value) {
  return value === "aal2" || value === "aal1" ? value : null;
}

export function aalLabel(value) {
  const aal = normalizeAal(value);
  return aal ? AAL_LABELS[aal] : "État de vérification inconnu";
}

export function needsMfa(value) {
  return normalizeAal(value) !== "aal2";
}

// Evaluation d'acces, sans jamais supposer un droit. `moduleAvailable` vient de
// la presence de `current_aal()` ; `isStaff` de `is_admin()` ou du role ; `aal`
// de Supabase Auth ou de `current_aal()`.
export function assessAccess({ moduleAvailable, isStaff, aal } = {}) {
  if (!moduleAvailable) {
    return {
      ok: false,
      reason: "module_absent",
      title: "Le QG n'est pas encore activé",
      message:
        "Les rôles et le journal de sécurité ne sont pas encore installés sur le serveur. Rien n'est simulé ici.",
    };
  }
  if (!isStaff) {
    return {
      ok: false,
      reason: "not_staff",
      title: "Accès réservé à l'équipe",
      message:
        "Votre compte n'a aucun rôle d'équipe. Cette page ne permet pas de s'en attribuer un.",
    };
  }
  if (needsMfa(aal)) {
    return {
      ok: false,
      reason: "mfa_required",
      title: "Double vérification requise",
      message:
        "Le QG exige une double vérification (aal2). Activez-la ci-dessous, puis revenez sur cette page.",
    };
  }
  return {
    ok: true,
    reason: "ready",
    title: "QG accessible",
    message: "Votre session est protégée par une double vérification.",
  };
}

export function normalizeStaff(rows) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isPlainObject(row)) continue;
    const id = uuid(row.id);
    if (!id || seen.has(id)) continue;
    const role = isStaffRole(row.role) ? row.role : null;
    if (!role) continue;
    const firstName = cleanText(row.first_name, 80) || null;
    const lastName = cleanText(row.last_name, 80) || null;
    seen.add(id);
    out.push({
      id,
      role,
      roleLabel: roleLabel(role),
      firstName,
      lastName,
      name: [firstName, lastName].filter(Boolean).join(" ") || null,
      blocked: Boolean(row.is_blocked),
      createdAt: isoDate(row.created_at),
    });
  }
  return out.sort((a, b) => {
    const byRole = rolePriority(a.role) - rolePriority(b.role);
    if (byRole !== 0) return byRole;
    const an = (a.name || "").toLocaleLowerCase("fr");
    const bn = (b.name || "").toLocaleLowerCase("fr");
    if (an !== bn) return an < bn ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function normalizeDetail(detail) {
  if (!isPlainObject(detail)) return {};
  const out = {};
  let count = 0;
  for (const [rawKey, value] of Object.entries(detail)) {
    if (count >= 20) break;
    const key = cleanText(rawKey, 40);
    if (!key || value == null) continue;
    if (typeof value === "string") {
      out[key] = cleanText(value, 200);
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else if (Array.isArray(value)) {
      const flat = value
        .filter((v) => typeof v === "string" || typeof v === "number")
        .slice(0, 10)
        .map((v) => cleanText(v, 60))
        .filter(Boolean);
      if (flat.length) out[key] = flat.join(", ");
      else continue;
    } else {
      continue;
    }
    count += 1;
  }
  return out;
}

export function eventLabel(type) {
  return EVENT_LABELS[type] || "Évènement de sécurité";
}

export function severityLabel(severity) {
  return SEVERITY_LABELS[severity] || "Information";
}

export function normalizeEvent(row) {
  if (!isPlainObject(row)) return null;
  const id = String(row.id ?? "").trim();
  if (!id) return null;
  const type = cleanText(row.event_type, 80);
  if (!type) return null;
  const severity = Object.prototype.hasOwnProperty.call(SEVERITY_LABELS, row.severity)
    ? row.severity
    : "info";
  return {
    id,
    type,
    label: eventLabel(type),
    severity,
    severityLabel: severityLabel(severity),
    actorId: uuid(row.actor_id),
    targetType: cleanText(row.target_type, 60) || null,
    targetId: cleanText(row.target_id, 120) || null,
    detail: normalizeDetail(row.detail),
    createdAt: isoDate(row.created_at),
  };
}

export function normalizeEvents(rows, limit = EVENT_PAGE_SIZE) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const event = normalizeEvent(row);
    if (!event || seen.has(event.id)) continue;
    seen.add(event.id);
    out.push(event);
  }
  out.sort((a, b) => {
    const at = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bt = b.createdAt ? Date.parse(b.createdAt) : 0;
    if (at !== bt) return bt - at;
    // Identifiant numerique : le plus grand est le plus recent.
    const an = Number(a.id);
    const bn = Number(b.id);
    if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return bn - an;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
  const max = Number.isInteger(limit) && limit > 0 ? limit : EVENT_PAGE_SIZE;
  return out.slice(0, max);
}

export function filterEvents(events, { severity, search } = {}) {
  const list = Array.isArray(events) ? events : [];
  const wanted = Object.prototype.hasOwnProperty.call(SEVERITY_LABELS, severity)
    ? severity
    : null;
  const needle = cleanText(search, 80).toLocaleLowerCase("fr");
  return list.filter((event) => {
    if (!event) return false;
    if (wanted && event.severity !== wanted) return false;
    if (!needle) return true;
    const hay = [
      event.type,
      event.label,
      event.targetType,
      event.targetId,
      ...Object.entries(event.detail || {}).map(([key, value]) => `${key} ${value}`),
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("fr");
    return hay.includes(needle);
  });
}

export function normalizeTotpCode(value) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 6);
}

export function isValidTotpCode(value) {
  return /^[0-9]{6}$/.test(normalizeTotpCode(value));
}

export function validateTotpCode(value) {
  const code = normalizeTotpCode(value);
  if (!/^[0-9]{6}$/.test(code)) throw new Error("code_totp_invalide");
  return code;
}

// Le QR renvoye par Supabase est un SVG. On ne l'injecte jamais tel quel : on
// reconstruit un SVG fait uniquement de balises et d'attributs attendus.
const SAFE_SVG_TAGS = new Set(["svg", "g", "rect", "path"]);
const SAFE_SVG_ATTRS = new Set([
  "xmlns",
  "width",
  "height",
  "viewbox",
  "fill",
  "d",
  "x",
  "y",
  "rx",
  "ry",
  "transform",
  "shape-rendering",
]);

export function safeQrSvg(svg) {
  if (typeof svg !== "string") return null;
  const source = svg.trim();
  if (source.length < 20 || source.length > 20000) return null;
  if (!/^<svg[\s>]/i.test(source) || !/<\/svg>\s*$/i.test(source)) return null;
  const tagRe = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)\s*>/g;
  const parts = [];
  let match;
  let opening = 0;
  let closing = 0;
  while ((match = tagRe.exec(source))) {
    const isClosing = match[1] === "/";
    const name = match[2].toLowerCase();
    if (!SAFE_SVG_TAGS.has(name)) return null;
    if (isClosing) {
      parts.push(`</${name}>`);
      closing += 1;
      continue;
    }
    const attrs = [];
    const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let attr;
    while ((attr = attrRe.exec(match[3]))) {
      const key = attr[1].toLowerCase();
      if (!SAFE_SVG_ATTRS.has(key)) continue;
      const value = attr[2] !== undefined ? attr[2] : attr[3];
      if (/[<>"']/.test(value)) return null;
      attrs.push(`${key}="${value}"`);
    }
    parts.push(`<${name}${attrs.length ? " " + attrs.join(" ") : ""}${match[4] ? "/" : ""}>`);
    opening += 1;
    if (match[4]) closing += 1;
  }
  if (!opening || opening !== closing) return null;
  const rebuilt = parts.join("");
  if (!/^<svg[\s>]/i.test(rebuilt) || rebuilt.includes("<script")) return null;
  return rebuilt;
}

export function normalizeEnrollment(data) {
  if (!isPlainObject(data)) return null;
  const factorId = uuid(data.id);
  if (!factorId) return null;
  const totp = isPlainObject(data.totp) ? data.totp : {};
  const secret = cleanText(totp.secret, 128) || null;
  const uri =
    typeof totp.uri === "string" && /^otpauth:\/\/totp\//i.test(totp.uri)
      ? totp.uri.slice(0, 500)
      : null;
  return {
    factorId,
    friendlyName: cleanText(data.friendly_name, 80) || null,
    secret,
    uri,
    qrSvg: safeQrSvg(totp.qr_code),
  };
}

export function normalizeFactor(row) {
  if (!isPlainObject(row)) return null;
  const id = uuid(row.id);
  if (!id) return null;
  return {
    id,
    friendlyName: cleanText(row.friendly_name, 80) || null,
    status: cleanText(row.status, 24) || "unverified",
    createdAt: isoDate(row.created_at),
  };
}

export function normalizeFactors(rows) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const factor = normalizeFactor(row);
    if (!factor || seen.has(factor.id)) continue;
    seen.add(factor.id);
    out.push(factor);
  }
  return out;
}

export function hasVerifiedFactor(factors) {
  return (Array.isArray(factors) ? factors : []).some(
    (f) => f && (f.status === "verified" || f.status === "active"),
  );
}

// Etapes d'enrolement, independantes du DOM pour etre testables.
export function mfaSteps({ factors, aal } = {}) {
  const verified = hasVerifiedFactor(factors);
  const strong = normalizeAal(aal) === "aal2";
  if (verified && strong) {
    return { state: "active", message: "La double vérification protège déjà votre compte." };
  }
  if (verified && !strong) {
    return {
      state: "verify",
      message:
        "Un moyen de vérification existe déjà. Saisissez le code de votre application pour cette session.",
    };
  }
  return {
    state: "enroll",
    message:
      "Ajoutez VAlex à votre application d'authentification (Google Authenticator, Authy, 1Password…).",
  };
}

export function buildEnrollOptions(friendlyName) {
  return {
    factorType: "totp",
    friendlyName: cleanText(friendlyName, 80) || "VAlex QG",
  };
}

export function buildChallengeParams(factorId) {
  const id = uuid(factorId);
  if (!id) throw new Error("facteur_invalide");
  return { factorId: id };
}

export function buildVerifyParams({ factorId, challengeId, code } = {}) {
  const id = uuid(factorId);
  if (!id) throw new Error("facteur_invalide");
  const challenge = cleanText(challengeId, 64);
  if (!challenge) throw new Error("defi_invalide");
  return { factorId: id, challengeId: challenge, code: validateTotpCode(code) };
}

export function buildUnenrollParams(factorId) {
  const id = uuid(factorId);
  if (!id) throw new Error("facteur_invalide");
  return { factorId: id };
}

export function mfaErrorMessage(error) {
  const m = String((error && error.message) || "").toLowerCase();
  if (m.includes("invalid") && m.includes("code")) {
    return "Code incorrect. Vérifiez les 6 chiffres affichés par votre application.";
  }
  if (m.includes("expired")) return "Ce code a expiré. Demandez un nouveau code.";
  if (m.includes("already") && m.includes("enrolled")) {
    return "Ce moyen de vérification est déjà enregistré sur votre compte.";
  }
  if (m.includes("rate") || m.includes("too many")) {
    return "Trop de tentatives. Patientez une minute avant de réessayer.";
  }
  if (m.includes("factor") && m.includes("not found")) {
    return "Ce moyen de vérification n'existe plus. Rechargez la page.";
  }
  return cleanText((error && error.message) || "", 200) || "La vérification a échoué.";
}
