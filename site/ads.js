// VAlex - affichage publicitaire cote navigateur.
//
// Lit uniquement `ad_home()` (p48). Aucune annonce n'est inventee : un
// emplacement payant vide reste invisible. Le contenu vient de la base et
// est insere via `textContent`, jamais via `innerHTML`.

import {
  adPriceCents,
  buildAdDisplay,
  buildPurchaseParams,
  formatCents,
  newIdempotencyKey,
  remainingLabel,
  validateCampaignInput,
} from "./ads-core.mjs";

function client() {
  if (typeof window === "undefined" || !window.sb) {
    throw new Error("client_indisponible");
  }
  return window.sb;
}

export async function load() {
  const { data, error } = await client().rpc("ad_home");
  if (error) throw new Error(error.message);
  const display = buildAdDisplay(data);
  resolveImages(display);
  return display;
}

// Traduit les chemins de stockage en URL publiques. Les buckets autorises
// sont ceux qui existent deja ; une URL https est acceptee telle quelle.
export function resolveImages(display) {
  let cache = null;
  const forPath = (path) => {
    if (!path) return null;
    if (/^https:\/\//i.test(path)) return path;
    const [bucket, ...rest] = String(path).split("/");
    if (!["product-images", "shop-logos"].includes(bucket) || !rest.length) {
      return null;
    }
    try {
      cache ??= client();
      return cache.storage.from(bucket).getPublicUrl(rest.join("/")).data
        .publicUrl;
    } catch (_) {
      return null;
    }
  };
  for (const ad of display.slots) ad.imageUrl = forPath(ad.imagePath);
  return display;
}

function node(doc, tag, className, text) {
  const element = doc.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  return element;
}

function badge(doc, text, className) {
  return node(doc, "span", `adbadge ${className || ""}`.trim(), text);
}

function adCard(doc, ad) {
  const isLink = ad.targetUrl && ad.targetUrl !== "/";
  const card = node(doc, isLink ? "a" : "div", "adcard");
  if (isLink) {
    card.href = ad.targetUrl;
    card.setAttribute("rel", "noopener");
  }
  card.setAttribute("data-slot", String(ad.slotNo));

  const head = node(doc, "span", "adcard__head");
  if (ad.kind === "valex") {
    head.appendChild(badge(doc, "VAlex", "adbadge--valex"));
  } else {
    head.appendChild(badge(
      doc,
      ad.tier === "premium" ? "Premium" : "Sponsorise",
      ad.tier === "premium" ? "adbadge--premium" : "adbadge--standard",
    ));
    const left = remainingLabel(ad.remainingSeconds);
    if (left) head.appendChild(node(doc, "span", "adcard__left", left));
  }
  card.appendChild(head);
  if (ad.imageUrl) {
    const image = doc.createElement("img");
    image.className = "adcard__img";
    image.src = ad.imageUrl;
    image.alt = "";
    image.loading = "lazy";
    card.appendChild(image);
  }
  card.appendChild(node(doc, "strong", "adcard__title", ad.title));
  card.appendChild(node(
    doc,
    "span",
    "adcard__note",
    ad.kind === "valex" ? "Annonce de la maison" : "Publicite payante",
  ));
  return card;
}

export function render(display, host, doc = document) {
  host.replaceChildren();
  if (!display || (!display.valex.length && !display.paid.length)) {
    host.hidden = true;
    return host;
  }
  host.hidden = false;

  const section = node(doc, "section", "adzone");
  section.setAttribute("aria-label", "Publicites");

  const head = node(doc, "div", "adzone__head");
  head.appendChild(node(doc, "span", null, "Publicite"));
  section.appendChild(head);

  if (display.valex.length) {
    const row = node(doc, "div", "adrow adrow--valex");
    for (const ad of display.valex) row.appendChild(adCard(doc, ad));
    section.appendChild(row);
  }
  if (display.paid.length) {
    const row = node(doc, "div", "adrow adrow--paid");
    for (const ad of display.paid) row.appendChild(adCard(doc, ad));
    section.appendChild(row);
  }

  host.appendChild(section);
  return host;
}

export async function mount(selector, doc = document) {
  const host = typeof selector === "string"
    ? doc.querySelector(selector)
    : selector;
  if (!host) return null;
  try {
    const display = await load();
    return render(display, host, doc);
  } catch (_) {
    host.replaceChildren();
    host.hidden = true;
    return host;
  }
}

export function quote(tier, hours) {
  return adPriceCents(tier, Number(hours));
}

// Achat d'un emplacement payant. Le montant est debite du portefeuille par
// `ad_purchase` ; l'appelant doit avoir confirme explicitement.
export async function purchase(input) {
  const params = buildPurchaseParams({
    ...input,
    idempotencyKey: input?.idempotencyKey || newIdempotencyKey(),
  });
  const { data, error } = await client().rpc("ad_purchase", params);
  if (error) throw new Error(error.message || "achat_publicite_refuse");
  return { id: data, priceCents: adPriceCents(params.p_tier, params.p_duration_hours) };
}

export { formatCents, validateCampaignInput, buildPurchaseParams };

const api = { load, mount, render, resolveImages, quote, purchase, formatCents, validateCampaignInput, buildPurchaseParams };

if (typeof window !== "undefined") {
  window.VAlexAds = api;
}

export default api;
