// VAlex - logique pure des notifications in-app.
// Aucun acces reseau, aucun contenu invente.
//
// Contrat p49 :
//   - `my_notifications(p_limit)` renvoie les lignes du compte courant ;
//   - `notifications_mark_read(p_ids)` marque tout ou une selection ;
//   - `kind` vaut `order_<statut>`, `dispute_staff`, `withdrawal_<statut>`
//     ou `ad_<statut>` ;
//   - `data` porte l'identifiant utile (`order_id`, `withdrawal_id`,
//     `campaign_id`).

export const MAX_TITLE = 160;
export const MAX_BODY = 500;
export const MAX_KIND = 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(value, max) {
  return String(value ?? "")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function kindLabel(kind) {
  const value = cleanText(kind, MAX_KIND);
  if (value.startsWith("order_")) return "Commande";
  if (value === "dispute_staff") return "Litige";
  if (value.startsWith("withdrawal_")) return "Retrait";
  if (value.startsWith("ad_")) return "Publicite";
  return "Alerte";
}

export function kindIcon(kind) {
  const value = cleanText(kind, MAX_KIND);
  if (value.startsWith("order_")) {
    if (value.includes("refund") || value.includes("paid")) return "money";
    if (value.includes("dispute")) return "alert";
    return "pkg";
  }
  if (value === "dispute_staff") return "alert";
  if (value.startsWith("withdrawal_")) return "money";
  if (value.startsWith("ad_")) return "crown";
  return "bell";
}

export function notificationHref(data) {
  if (!isPlainObject(data)) return null;
  if (typeof data.order_id === "string" && UUID_RE.test(data.order_id)) {
    return "#/commande/" + data.order_id;
  }
  if (
    typeof data.withdrawal_id === "string" && UUID_RE.test(data.withdrawal_id)
  ) {
    return "#/paiement";
  }
  if (
    typeof data.campaign_id === "string" && UUID_RE.test(data.campaign_id)
  ) {
    return "#/tableau-de-bord";
  }
  return null;
}

export function normalizeNotification(row) {
  if (!isPlainObject(row)) return null;
  const id = cleanText(row.id, 64);
  const title = cleanText(row.title, MAX_TITLE);
  if (!id || !title) return null;
  const kind = cleanText(row.kind, MAX_KIND) || "info";
  const body = cleanText(row.body, MAX_BODY) || null;
  const data = isPlainObject(row.data) ? row.data : {};
  const createdRaw = typeof row.created_at === "string" ? row.created_at : "";
  const createdAt = Number.isNaN(Date.parse(createdRaw)) ? null : createdRaw;
  return {
    id,
    kind,
    label: kindLabel(kind),
    icon: kindIcon(kind),
    title,
    body,
    data,
    href: notificationHref(data),
    read: Boolean(row.read_at),
    createdAt,
  };
}

// Deduplication par identifiant, ordre conserve (le serveur trie deja par
// date decroissante). Une ligne invalide est ignoree, pas corrigee.
export function normalizeNotifications(rows) {
  const seen = new Set();
  const items = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const item = normalizeNotification(row);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return items;
}

export function unreadCount(items) {
  return (Array.isArray(items) ? items : []).filter((item) => !item.read).length;
}

export function markRead(items, ids) {
  const list = Array.isArray(items) ? items : [];
  const target = ids == null ? null : new Set(ids.map(String));
  return list.map((item) => (
    item.read || (target && !target.has(item.id))
      ? item
      : { ...item, read: true }
  ));
}

export function buildView(rows) {
  const items = normalizeNotifications(rows);
  return {
    items,
    total: items.length,
    unread: unreadCount(items),
  };
}

// Libelle court et deterministe. `nowMs` est injecte pour les tests.
export function relativeTime(iso, nowMs = Date.now()) {
  const then = Date.parse(iso || "");
  if (Number.isNaN(then)) return "";
  const seconds = Math.floor((Number(nowMs) - then) / 1000);
  if (seconds < 0) return "";
  if (seconds < 60) return "a l'instant";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} j`;
  const thenDate = new Date(then);
  return thenDate.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

export function groupByDay(items, nowMs = Date.now()) {
  const groups = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const then = Date.parse(item.createdAt || "");
    let label = "Plus tot";
    if (!Number.isNaN(then)) {
      const now = new Date(Number(nowMs));
      const date = new Date(then);
      const sameDay = now.toDateString() === date.toDateString();
      const yesterday = new Date(Number(nowMs) - 86400000);
      if (sameDay) label = "Aujourd'hui";
      else if (yesterday.toDateString() === date.toDateString()) label = "Hier";
      else {
        label = date.toLocaleDateString("fr-FR", {
          day: "numeric",
          month: "long",
        });
      }
    }
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(item);
  }
  return Array.from(groups, ([label, list]) => ({ label, items: list }));
}
