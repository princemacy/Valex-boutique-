// VAlex - notifications in-app cote navigateur.
//
// Lit uniquement `my_notifications` (p49). Aucune notification n'est
// inventee : si la fonction distante manque, `load` leve une erreur et
// l'appelant garde son ancien affichage.
import {
  buildView,
  groupByDay,
  markRead,
  relativeTime,
} from "./notifications-core.mjs";

function client() {
  if (typeof window === "undefined" || !window.sb) {
    throw new Error("client_indisponible");
  }
  return window.sb;
}

function cleanLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 40;
  return Math.max(1, Math.min(100, Math.floor(n)));
}

export async function load(limit = 40) {
  const { data, error } = await client().rpc("my_notifications", {
    p_limit: cleanLimit(limit),
  });
  if (error) throw new Error("notifications_indisponibles");
  return buildView(data);
}

export async function markAllRead() {
  const { error } = await client().rpc("notifications_mark_read", {
    p_ids: null,
  });
  if (error) throw new Error("notifications_indisponibles");
  return true;
}

export async function markItemsRead(ids) {
  const list = Array.isArray(ids) ? ids.filter(Boolean).map(String) : [];
  if (!list.length) return true;
  const { error } = await client().rpc("notifications_mark_read", {
    p_ids: list,
  });
  if (error) throw new Error("notifications_indisponibles");
  return true;
}

export async function unreadCount() {
  const view = await load(100);
  return view.unread;
}

function node(doc, tag, className, text) {
  const element = doc.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  if (tag === "button") element.type = "button";
  return element;
}

export function render(view, host, doc = document) {
  const items = Array.isArray(view?.items) ? view.items : [];
  const unread = Number(view?.unread) || 0;
  host.replaceChildren();

  const wrap = node(doc, "div", "nlist");
  const head = node(doc, "div", "nlist__head");
  head.appendChild(node(
    doc,
    "span",
    null,
    unread ? `${unread} non lue${unread > 1 ? "s" : ""}` : "Tout est lu",
  ));
  if (unread > 0) {
    const button = node(doc, "button", "nlist__read", "Tout marquer comme lu");
    button.id = "notifRead";
    head.appendChild(button);
  }
  wrap.appendChild(head);

  if (!items.length) {
    const empty = node(doc, "div", "nlist__empty");
    empty.appendChild(node(doc, "strong", null, "Rien de nouveau"));
    empty.appendChild(node(
      doc,
      "span",
      "t-small",
      "Le suivi de vos commandes et de vos paiements apparaitra ici.",
    ));
    wrap.appendChild(empty);
    host.appendChild(wrap);
    return host;
  }

  for (const item of items) {
    const el = node(
      doc,
      item.href ? "a" : "div",
      `nlist__item${item.read ? "" : " un"}`,
    );
    if (item.href) el.href = item.href;
    el.setAttribute("data-id", item.id);

    el.appendChild(node(doc, "span", "nlist__kind", item.label));
    const body = node(doc, "span", "nlist__b");
    body.appendChild(node(doc, "strong", null, item.title));
    if (item.body) body.appendChild(node(doc, "span", null, item.body));
    body.appendChild(node(doc, "em", null, relativeTime(item.createdAt)));
    el.appendChild(body);
    if (!item.read) el.appendChild(node(doc, "span", "nlist__dot"));
    if (item.href && !item.read) {
      el.addEventListener?.("click", () => {
        markItemsRead([item.id]).catch(() => {});
      });
    }
    wrap.appendChild(el);
  }

  host.appendChild(wrap);
  return host;
}

export async function mount(host, doc = document) {
  const target = typeof host === "string" ? doc.querySelector(host) : host;
  if (!target) return null;
  try {
    const view = await load(60);
    return render(view, target, doc);
  } catch (_) {
    return null;
  }
}

export { groupByDay, markRead, relativeTime };

const api = {
  load,
  mount,
  render,
  markAllRead,
  markItemsRead,
  unreadCount,
  relativeTime,
  groupByDay,
};

if (typeof window !== "undefined") {
  window.VAlexNotifications = api;
}

export default api;
