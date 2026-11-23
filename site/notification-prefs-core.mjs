// VAlex - logique pure des preferences de notification (p52).
//
// Le serveur resout une preference par type exact, puis par le type global
// `*`, puis par defaut (tout active). Les types `order_*`, `withdrawal_*` et
// `ad_*` dependent du statut : leur nom exact n'est pas connu a l'avance.
// On ne propose donc PAS de reglage par famille : seul le global les couvre.
// Inventer un interrupteur « toutes les commandes » qui ne changerait rien
// serait un mensonge d'interface.
//
// Aucun acces reseau ici, aucune valeur inventee.

import { normalizePreferences } from "./push-core.mjs";

export const GLOBAL_KIND = "*";
export const MAX_KIND = 40;
export const KIND_RE = /^(\*|[a-z0-9_.-]{1,40})$/;

// Types fixes reellement emis par le serveur (verifies dans p49).
export const KNOWN_KINDS = Object.freeze([
  {
    kind: "support_opened",
    label: "Demande d'assistance enregistrée",
    group: "Assistance",
  },
  {
    kind: "support_reply",
    label: "Réponse à une demande",
    group: "Assistance",
  },
  {
    kind: "support_status",
    label: "Changement de statut d'une demande",
    group: "Assistance",
  },
  {
    kind: "support_assigned",
    label: "Demande attribuée à un agent",
    group: "Équipe",
  },
  {
    kind: "dispute_staff",
    label: "Litige à traiter",
    group: "Équipe",
  },
]);

// Familles a nom variable : elles suivent le reglage global.
export const DYNAMIC_FAMILIES = Object.freeze([
  { prefix: "order_", label: "Commandes", note: "un type par statut de commande" },
  { prefix: "withdrawal_", label: "Retraits", note: "un type par statut de retrait" },
  { prefix: "ad_", label: "Publicités", note: "un type par statut de campagne" },
]);

const DEFAULTS = Object.freeze({ inApp: true, push: true });

export function isGlobalKind(kind) {
  return kind === GLOBAL_KIND;
}

export function isValidKind(kind) {
  return typeof kind === "string" && KIND_RE.test(kind);
}

export function knownKind(kind) {
  return KNOWN_KINDS.some((entry) => entry.kind === kind);
}

export function dynamicFamily(kind) {
  const value = String(kind ?? "");
  return DYNAMIC_FAMILIES.find((family) => value.startsWith(family.prefix)) || null;
}

// Une ligne lue est normalisee ; une ligne sans type valide est ignoree.
export function normalizePreferencesMap(rows) {
  const source = normalizePreferences(rows);
  const map = new Map();
  for (const [kind, pref] of source) {
    if (!isValidKind(kind)) continue;
    map.set(kind, { inApp: pref.inApp !== false, push: pref.push !== false });
  }
  return map;
}

// Resolution identique au serveur : exact, puis global, puis defaut.
export function effective(map, kind) {
  const prefs = map instanceof Map ? map : normalizePreferencesMap(map);
  if (!isValidKind(kind)) return { ...DEFAULTS, source: "default" };
  if (prefs.has(kind)) return { ...prefs.get(kind), source: "exact" };
  if (prefs.has(GLOBAL_KIND)) return { ...prefs.get(GLOBAL_KIND), source: "global" };
  return { ...DEFAULTS, source: "default" };
}

export function globalPreference(map) {
  return effective(map, GLOBAL_KIND);
}

export function rowsFor(map) {
  const prefs = map instanceof Map ? map : normalizePreferencesMap(map);
  const global = globalPreference(prefs);
  const rows = [
    {
      kind: GLOBAL_KIND,
      label: "Tout le compte",
      group: "Général",
      inApp: global.inApp,
      push: global.push,
      source: global.source,
      overridden: false,
    },
  ];
  for (const entry of KNOWN_KINDS) {
    const value = effective(prefs, entry.kind);
    rows.push({
      ...entry,
      inApp: value.inApp,
      push: value.push,
      source: value.source,
      overridden: value.source === "exact",
    });
  }
  return rows;
}

export function summarize(map) {
  const prefs = map instanceof Map ? map : normalizePreferencesMap(map);
  const rows = rowsFor(prefs);
  const exact = rows.filter((row) => row.overridden);
  return {
    globalInApp: rows[0].inApp,
    globalPush: rows[0].push,
    overrides: exact.length,
    pushOff: rows.filter((row) => !row.push).length,
    inAppOff: rows.filter((row) => !row.inApp).length,
    rows: rows.length,
  };
}

// Applique un changement localement, sans muter la carte d'origine.
export function toggle(map, kind, field, value) {
  const prefs = map instanceof Map ? map : normalizePreferencesMap(map);
  if (!isValidKind(kind)) throw new Error("kind_invalide");
  if (field !== "inApp" && field !== "push") throw new Error("champ_invalide");
  const current = effective(prefs, kind);
  const next = new Map(prefs);
  next.set(kind, {
    inApp: field === "inApp" ? Boolean(value) : current.inApp,
    push: field === "push" ? Boolean(value) : current.push,
  });
  return next;
}

// Aligne un type sur le reglage global. La suppression d'une ligne n'existe
// pas cote serveur : on recopie les valeurs globales, ce qui produit le meme
// comportement et reste honnete a l'affichage.
export function alignToGlobal(map, kind) {
  const prefs = map instanceof Map ? map : normalizePreferencesMap(map);
  if (!isValidKind(kind) || isGlobalKind(kind)) return new Map(prefs);
  const global = globalPreference(prefs);
  const next = new Map(prefs);
  next.set(kind, { inApp: global.inApp, push: global.push });
  return next;
}

export function sameAsGlobal(map, kind) {
  if (isGlobalKind(kind)) return true;
  const prefs = map instanceof Map ? map : normalizePreferencesMap(map);
  const value = effective(prefs, kind);
  const global = globalPreference(prefs);
  return value.inApp === global.inApp && value.push === global.push;
}

export function validateToggle({ kind, field } = {}) {
  if (!isValidKind(kind)) {
    return { ok: false, error: "Type de notification inconnu." };
  }
  if (field !== "inApp" && field !== "push") {
    return { ok: false, error: "Canal inconnu." };
  }
  return { ok: true, kind, field };
}

// Etat d'acces : la lecture des preferences exige seulement une session.
// Aucune double verification n'est demandee par p52 pour ce reglage.
export function assessAccess({ signedIn, moduleAvailable } = {}) {
  if (!signedIn) {
    return {
      ok: false,
      reason: "signed_out",
      title: "Connectez-vous",
      message:
        "Les préférences de notification appartiennent à votre compte. Connectez-vous pour les régler.",
    };
  }
  if (!moduleAvailable) {
    return {
      ok: false,
      reason: "module_absent",
      title: "Réglages pas encore activés",
      message:
        "Les préférences de notification ne sont pas installées sur le serveur. Aucun réglage n'est simulé.",
    };
  }
  return {
    ok: true,
    reason: "ready",
    title: "Préférences de notification",
    message:
      "Chaque type peut être coupé séparément. Tant qu'aucune exception n'est posée, le réglage global s'applique. Les commandes, retraits et publicités utilisent un type par statut : ils suivent le réglage global.",
  };
}

export function channelLabel(field) {
  if (field === "inApp") return "dans le site";
  if (field === "push") return "en push";
  return "canal inconnu";
}
