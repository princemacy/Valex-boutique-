// VAlex - regles pures du nom d'utilisateur.
// Le serveur reste seul juge (p60). Ce module sert a guider la saisie et a
// tester les memes regles sans navigateur.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 24;
export const USERNAME_PATTERN = /^[a-z0-9]+([._][a-z0-9]+)*$/;

export const RESERVED_USERNAMES = Object.freeze([
  "admin", "administrateur", "administration", "owner", "proprietaire",
  "support", "assistance", "aide", "help", "service", "securite", "security",
  "moderateur", "moderation", "moderator", "staff", "equipe", "team",
  "officiel", "official", "valex", "valexboutique", "paiement", "payment",
  "finance", "finances", "root", "system", "systeme", "api", "www", "mail",
  "contact", "info", "boutique", "vendeur", "acheteur", "ambassadeur",
  "livreur", "relais",
]);

const RESERVED_SET = new Set(RESERVED_USERNAMES);

export function normalizeUsername(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function usernameError(value) {
  const v = normalizeUsername(value);
  if (v.length < USERNAME_MIN || v.length > USERNAME_MAX) {
    return `Le nom d'utilisateur doit contenir entre ${USERNAME_MIN} et ${USERNAME_MAX} caractères.`;
  }
  if (!USERNAME_PATTERN.test(v)) {
    return "Lettres, chiffres, point ou tiret bas uniquement, sans séparateur au début, à la fin ni en double.";
  }
  if (v.includes("valex")) {
    return "Ce nom est réservé à VAlex.";
  }
  const segments = v.split(/[._]/);
  if (segments.some((segment) => RESERVED_SET.has(segment))) {
    return "Ce nom est réservé.";
  }
  return "";
}

export function isValidUsername(value) {
  return usernameError(value) === "";
}
