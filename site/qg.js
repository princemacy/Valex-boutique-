// VAlex - QG cote navigateur (p45).
//
// Lecture seule : `staff_directory` et `security_events` sont filtres par RLS.
// Aucune fonction d'attribution de role n'est appelee, car aucune n'existe.
// L'enrolement TOTP passe par l'API MFA de Supabase Auth.
import {
  EVENT_PAGE_SIZE,
  ROLE_ASSIGNMENT_NOTICE,
  STAFF_ROLES,
  aalLabel,
  assessAccess,
  buildChallengeParams,
  buildEnrollOptions,
  buildUnenrollParams,
  buildVerifyParams,
  eventLabel,
  filterEvents,
  hasVerifiedFactor,
  mfaErrorMessage,
  mfaSteps,
  normalizeAal,
  normalizeEnrollment,
  normalizeEvents,
  normalizeFactors,
  normalizeStaff,
  normalizeTotpCode,
  roleLabel,
  severityLabel,
  validateTotpCode,
} from "./qg-core.mjs";

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
    return normalizeAal(data.currentLevel) || normalizeAal(data.nextLevel);
  } catch (_) {
    return null;
  }
}

// Determine l'etat d'acces sans jamais supposer un droit.
export async function loadAccess() {
  const sb = client();
  let moduleAvailable = false;
  let aal = null;
  try {
    const { data, error } = await sb.rpc("current_aal");
    if (!error) {
      moduleAvailable = true;
      aal = normalizeAal(data);
    }
  } catch (_) {
    moduleAvailable = false;
  }

  if (!aal) aal = await authAal();

  let isStaff = false;
  try {
    const { data, error } = await sb.rpc("is_admin");
    if (!error) isStaff = data === true;
  } catch (_) {
    isStaff = false;
  }

  let role = null;
  if (moduleAvailable) {
    try {
      const { data, error } = await sb.rpc("current_staff_role");
      if (!error && typeof data === "string") role = data;
    } catch (_) {
      role = null;
    }
  }
  if (!role && isStaff) role = "admin";
  if (role) isStaff = true;

  const access = assessAccess({ moduleAvailable, isStaff, aal });
  return {
    moduleAvailable,
    isStaff,
    aal,
    role,
    roleLabel: role ? roleLabel(role) : null,
    access,
  };
}

export async function loadStaff() {
  const { data, error } = await client()
    .from("staff_directory")
    .select("id,role,first_name,last_name,is_blocked,created_at");
  if (error) return [];
  return normalizeStaff(data);
}

export async function loadEvents({ limit = EVENT_PAGE_SIZE, severity, search } = {}) {
  const size = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : EVENT_PAGE_SIZE;
  const { data, error } = await client()
    .from("security_events")
    .select("id,actor_id,event_type,severity,target_type,target_id,detail,created_at")
    .order("created_at", { ascending: false })
    .limit(size);
  if (error) return [];
  return filterEvents(normalizeEvents(data, size), { severity, search });
}

export async function loadFactors() {
  const auth = client().auth;
  if (!auth || !auth.mfa || typeof auth.mfa.listFactors !== "function") return [];
  try {
    const { data, error } = await auth.mfa.listFactors();
    if (error || !data) return [];
    return normalizeFactors(data.all);
  } catch (_) {
    return [];
  }
}

export async function enrollmentState() {
  const aal = (await loadAccess()).aal;
  const factors = await loadFactors();
  return { aal, factors, verified: hasVerifiedFactor(factors), step: mfaSteps({ factors, aal }) };
}

export async function startEnrollment(friendlyName) {
  const { data, error } = await client().auth.mfa.enroll(
    buildEnrollOptions(friendlyName),
  );
  if (error) throw new Error(mfaErrorMessage(error));
  const enrollment = normalizeEnrollment(data);
  if (!enrollment) throw new Error("Réponse d'enrôlement illisible. Réessayez.");
  return enrollment;
}

export async function challenge(factorId) {
  const { data, error } = await client().auth.mfa.challenge(
    buildChallengeParams(factorId),
  );
  if (error) throw new Error(mfaErrorMessage(error));
  const id = data && data.id ? String(data.id) : null;
  if (!id) throw new Error("Défi de vérification absent. Réessayez.");
  return id;
}

export async function verify({ factorId, challengeId, code } = {}) {
  const params = buildVerifyParams({ factorId, challengeId, code });
  const { data, error } = await client().auth.mfa.verify(params);
  if (error) throw new Error(mfaErrorMessage(error));
  return data;
}

export async function unenroll(factorId) {
  const { error } = await client().auth.mfa.unenroll(buildUnenrollParams(factorId));
  if (error) throw new Error(mfaErrorMessage(error));
  return true;
}

export {
  AAL_LABELS,
  EVENT_LABELS,
  EVENT_PAGE_SIZE,
  ROLE_ASSIGNMENT_NOTICE,
  ROLE_LABELS,
  SEVERITY_LABELS,
  STAFF_ROLES,
  aalLabel,
  assessAccess,
  eventLabel,
  filterEvents,
  hasVerifiedFactor,
  isStaffRole,
  mfaSteps,
  needsMfa,
  normalizeAal,
  normalizeEvents,
  normalizeFactors,
  normalizeStaff,
  normalizeTotpCode,
  roleLabel,
  severityLabel,
  validateTotpCode,
} from "./qg-core.mjs";

const api = {
  loadAccess,
  loadStaff,
  loadEvents,
  loadFactors,
  enrollmentState,
  startEnrollment,
  challenge,
  verify,
  unenroll,
  aalLabel,
  roleLabel,
  severityLabel,
  eventLabel,
  mfaSteps,
  normalizeTotpCode,
  validateTotpCode,
  filterEvents,
  ROLE_ASSIGNMENT_NOTICE,
  STAFF_ROLES,
};

if (typeof window !== "undefined") {
  window.VAlexQG = api;
}

export default api;
