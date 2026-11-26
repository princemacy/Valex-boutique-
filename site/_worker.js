// VAlex — Cloudflare Pages (mode avancé). Rend chaque produit et chaque boutique lisible par Google
// et par WhatsApp/Facebook (photo + prix dans l'aperçu), puis ouvre le site normal.
// Aucune clé secrète ici : seulement la clé publique (publishable), déjà présente dans le site.
const SB = "https://amigpgmtbyfobbcjlave.supabase.co";
const KEY = "sb_publishable_OVLKYU3-9c-t_3UwY92UzQ_kxd1Z63Q";
const CSP = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'sha256-D1GAkZrlynnqzKCVI79cMBk2y2icXjs9c293ZVncTXw=' https://cdn.jsdelivr.net https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://amigpgmtbyfobbcjlave.supabase.co; connect-src 'self' https://accounts.google.com https://amigpgmtbyfobbcjlave.supabase.co wss://amigpgmtbyfobbcjlave.supabase.co https://api.upcitemdb.com https://world.openfoodfacts.org https://world.openbeautyfacts.org https://world.openproductsfacts.org https://nominatim.openstreetmap.org https://overpass-api.de; media-src 'self' blob: https://amigpgmtbyfobbcjlave.supabase.co; worker-src 'self' blob:; manifest-src 'self'; frame-src https://accounts.google.com; upgrade-insecure-requests";
const SEC = {
  "content-security-policy": CSP,
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(self), geolocation=(), payment=(), usb=()",
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const img = (bucket, p) => !p ? null : /^https?:/.test(p) ? p : `${SB}/storage/v1/object/public/${bucket}/${p}`;
// Les prix sont stockes en centimes. L'affichage public est en GDS, la monnaie
// decidee par le proprietaire. Les valeurs stockees ne sont jamais converties.
const gds = (c) => Math.round((c || 0) / 100).toLocaleString("fr-FR") + " GDS";
async function rest(path) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, cf: { cacheTtl: 300, cacheEverything: true } });
  if (!r.ok) throw new Error("supabase_" + r.status);
  return r.json();
}
// Une lecture en erreur ne doit jamais etre confondue avec une absence de
// resultat : la premiere garde la page client, la seconde rend une vraie 404.
async function restOne(path) {
  try {
    const rows = await rest(path);
    return { ok: true, item: Array.isArray(rows) ? rows[0] : null };
  } catch (_) {
    return { ok: false, item: null };
  }
}
function secure(res) {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(SEC)) h.set(k, v);
  h.delete("content-encoding");
  h.delete("content-length");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
function inject(res, { title, desc, image, url, jsonld, body, hash }) {
  const head = `<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="product"><meta property="og:site_name" content="VAlex Boutique"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">${image ? `<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image">` : ""}
<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>
<script src="/r.js" data-hash="${esc(hash)}"></script>`;
  return new HTMLRewriter()
    .on("title", { element(e) { e.remove(); } })
    .on('meta[property^="og:"]', { element(e) { e.remove(); } })
    .on('meta[name="description"]', { element(e) { e.remove(); } })
    .on('meta[name^="twitter:"]', { element(e) { e.remove(); } })
    .on('link[rel="canonical"]', { element(e) { e.remove(); } })
    .on("head", { element(e) { e.append(head, { html: true }); } })
    .on("body", { element(e) { e.prepend(`<noscript><main style="font-family:sans-serif;padding:16px">${body}</main></noscript>`, { html: true }); } })
    .transform(res);
}
function homeMeta(res, origin) {
  const base = esc(String(origin || "").replace(/\/+$/, ""));
  const head = `<link rel="canonical" href="${base}/"><meta property="og:url" content="${base}/"><meta property="og:image" content="${base}/og-image.png"><meta name="twitter:image" content="${base}/og-image.png">`;
  return new HTMLRewriter()
    .on('link[rel="canonical"]', { element(e) { e.remove(); } })
    .on('meta[property="og:url"]', { element(e) { e.remove(); } })
    .on('meta[property="og:image"]', { element(e) { e.remove(); } })
    .on('meta[name="twitter:image"]', { element(e) { e.remove(); } })
    .on("head", { element(e) { e.append(head, { html: true }); } })
    .transform(res);
}
function publicPageMeta(res, origin, path) {
  const url = `${origin}${path}`;
  const head = `<link rel="canonical" href="${esc(url)}"><meta property="og:url" content="${esc(url)}">`;
  return new HTMLRewriter()
    .on('link[rel="canonical"]', { element(e) { e.remove(); } })
    .on('meta[property="og:url"]', { element(e) { e.remove(); } })
    .on("head", { element(e) { e.append(head, { html: true }); } })
    .transform(res);
}
const ERRORS = {
  400: ["La demande est incomplète", "Il manque une information pour traiter cette demande. Revenez en arrière et vérifiez le formulaire."],
  401: ["Connectez-vous pour continuer", "Cette page demande un compte VAlex. La connexion se fait depuis le menu du compte."],
  403: ["Cet espace ne vous est pas ouvert", "Votre compte n'a pas les droits nécessaires pour cette page. Si vous pensez qu'il s'agit d'une erreur, contactez l'assistance."],
  404: ["Cette page n'existe pas", "Le lien est peut-être ancien, ou l'adresse a été mal recopiée. Le catalogue et les boutiques restent accessibles depuis l'accueil."],
  409: ["Cette action a déjà été faite", "La demande a déjà été enregistrée. Actualisez la page avant de réessayer pour éviter un doublon."],
  422: ["Ces informations n'ont pas pu être vérifiées", "Un champ est invalide ou une donnée a changé entre-temps. Corrigez la demande et recommencez."],
  429: ["Trop de tentatives", "Trop de demandes ont été envoyées en peu de temps. Patientez quelques minutes avant de réessayer."],
  500: ["Une erreur interne est survenue", "VAlex n'a pas pu terminer cette action. Rien n'est perdu : réessayez dans un instant."],
  502: ["Le service ne répond pas", "Un service nécessaire à cette page est momentanément indisponible. Réessayez dans quelques minutes."],
  503: ["Le service est momentanément indisponible", "VAlex effectue une maintenance ou reçoit trop de demandes. Réessayez plus tard, vos données restent en place."],
};
function errorPage(code, origin) {
  const known = ERRORS[code] ? code : 404;
  const [title, lede] = ERRORS[known];
  const txt = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const base = esc(String(origin || "").replace(/\/+$/, ""));
  return new Response(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${txt(title)} | VAlex Boutique</title>
<meta name="description" content="${esc(lede)}"><meta name="robots" content="noindex">
<meta name="theme-color" content="#FF6A00"><link rel="canonical" href="${base}/erreur/${known}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<style>
:root{--ink:#111;--ink-2:#3D3D3D;--ink-3:#767676;--line:#E8E8E8;--accent:#FF6A00}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{background:#FFF;color:var(--ink);font-family:"Instrument Sans","Segoe UI",Arial,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 20px;text-align:center}
.mark{display:flex;align-items:center;gap:10px;margin-bottom:40px;color:var(--ink);text-decoration:none}
.mark svg{width:40px;height:40px;display:block}.mark b{font-size:18px;font-weight:700}
.code{font-size:14px;font-weight:700;letter-spacing:2px;color:var(--accent);margin:0 0 12px}
h1{margin:0;font-size:32px;line-height:1.15;font-weight:800;letter-spacing:-.5px;max-width:560px}
p.lede{margin:16px 0 32px;font-size:17px;line-height:1.5;color:var(--ink-2);max-width:500px}
.actions{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}
a.btn{display:inline-block;background:var(--accent);color:#FFF;text-decoration:none;font-weight:700;font-size:16px;padding:14px 22px;border-radius:8px}
a.btn:hover{background:#E85F00}a.second{background:#FFF;color:var(--ink);border:1.5px solid var(--line)}a.second:hover{border-color:var(--ink)}
.foot{margin-top:48px;font-size:13px;color:var(--ink-3)}
@media (min-width:720px){h1{font-size:40px}p.lede{font-size:18px}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style></head><body>
<a class="mark" href="/" aria-label="VAlex Boutique, accueil"><svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect width="64" height="64" fill="#FFF"/><path d="M9 11h12.4L32 42.2 42.6 11H55L37.8 55H26.2z" fill="#111"/><rect x="9" y="57" width="46" height="4" fill="#FF6A00"/></svg><b>VAlex Boutique</b></a>
<p class="code">ERREUR ${known}</p><h1>${txt(title)}.</h1><p class="lede">${txt(lede)}</p>
<div class="actions"><a class="btn" href="/">Retour à l'accueil</a><a class="btn second" href="/#/assistance">Contacter l'assistance</a></div>
<p class="foot">VAlex Boutique, Haïti</p></body></html>`, { status: known, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });
}
export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    const page = () => env.ASSETS.fetch(new Request(new URL("/", u), req));
    let m;
    if ((m = u.pathname.match(/^\/p\/([0-9a-f-]{36})\/?$/))) {
      const found = await restOne(`catalog_products?id=eq.${m[1]}&is_demo=eq.false&select=id,title,description,min_price_cents,cover_path,shop_name,shop_slug,shop_city,total_stock,category_label`);
      if (!found.ok) return secure(await homeMeta(await page(), u.origin));
      const p = found.item;
      if (!p) return secure(errorPage(404, u.origin));
      const image = img("product-images", p.cover_path), url = `${u.origin}/p/${p.id}`;
      const desc = `${gds(p.min_price_cents)} · ${p.shop_name}${p.shop_city ? " à " + p.shop_city : ""}. ${(p.description || "").slice(0, 140)}`;
      const jsonld = { "@context": "https://schema.org", "@type": "Product", name: p.title, description: p.description || p.title, image: image ? [image] : undefined, category: p.category_label,
        brand: { "@type": "Brand", name: p.shop_name },
        offers: { "@type": "Offer", url, priceCurrency: "HTG", price: Math.round((p.min_price_cents || 0) / 100), availability: (p.total_stock || 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", seller: { "@type": "Organization", name: p.shop_name } } };
      const out = secure(inject(await page(), { title: `${p.title} — ${gds(p.min_price_cents)} | VAlex`, desc, image, url, jsonld, hash: `#/produit/${p.id}`,
        body: `<h1>${esc(p.title)}</h1><p><b>${gds(p.min_price_cents)}</b> — ${esc(p.shop_name)}, ${esc(p.shop_city || "")}</p>${image ? `<img src="${esc(image)}" alt="${esc(p.title)}" width="320">` : ""}<p>${esc(p.description || "")}</p><p><a href="/b/${esc(p.shop_slug)}">Voir la boutique ${esc(p.shop_name)}</a></p>` }));
      out.headers.set("cache-control", "public, max-age=300");
      return out;
    }
    if ((m = u.pathname.match(/^\/b\/([a-z0-9-]{2,60})\/?$/))) {
      const found = await restOne(`shops?slug=eq.${m[1]}&is_demo=eq.false&select=id,name,slug,activity,city,department,logo_url`);
      if (!found.ok) return secure(await homeMeta(await page(), u.origin));
      const s = found.item;
      if (!s) return secure(errorPage(404, u.origin));
      const prods = await rest(`catalog_products?shop_id=eq.${s.id}&is_demo=eq.false&select=id,title,min_price_cents&order=published_at.desc&limit=30`);
      const url = `${u.origin}/b/${s.slug}`, image = img("shop-logos", s.logo_url);
      const out = secure(inject(await page(), { title: `${s.name} — boutique à ${s.city || "Haïti"} | VAlex`, desc: `${s.activity || "Boutique"} · ${prods.length} articles · ${s.city || ""} ${s.department || ""}. Commandez sur VAlex, paiement à la livraison possible.`,
        image, url, hash: `#/boutique/${s.slug}`,
        jsonld: { "@context": "https://schema.org", "@type": "Store", name: s.name, url, image, address: { "@type": "PostalAddress", addressLocality: s.city, addressRegion: s.department, addressCountry: "HT" } },
        body: `<h1>${esc(s.name)}</h1><p>${esc(s.activity || "")}</p><ul>${prods.map((p) => `<li><a href="/p/${p.id}">${esc(p.title)}</a> — ${gds(p.min_price_cents)}</li>`).join("")}</ul>` }));
      out.headers.set("cache-control", "public, max-age=300");
      return out;
    }
    if (u.pathname === "/a-propos.html" || u.pathname === "/faq.html" || u.pathname === "/a-propos/" || u.pathname === "/faq/" || u.pathname === "/404.html") {
      const clean = u.pathname === "/404.html" ? "/404" : u.pathname.startsWith("/a-propos") ? "/a-propos" : "/faq";
      return secure(Response.redirect(`${u.origin}${clean}`, 301));
    }
    if (u.pathname === "/a-propos" || u.pathname === "/faq") {
      // L'asset est stocke en .html, mais Cloudflare redirige .html vers
      // l'adresse propre. On demande donc directement l'adresse propre a
      // ASSETS : sinon le Worker renvoie sa propre redirection en boucle.
      const out = secure(publicPageMeta(await env.ASSETS.fetch(new Request(new URL(u.pathname, u), req)), u.origin, u.pathname));
      out.headers.set("cache-control", "public, max-age=3600");
      return out;
    }
    if (u.pathname === "/404") return secure(errorPage(404, u.origin));
    if (u.pathname === "/llms.txt") {
      const asset = await env.ASSETS.fetch(new Request(new URL("/llms.txt", u), req));
      const h = new Headers(asset.headers);
      h.set("content-type", "text/plain; charset=utf-8");
      h.set("cache-control", "public, max-age=3600");
      return secure(new Response(asset.body, { status: asset.status, headers: h }));
    }
    if (u.pathname === "/sitemap.xml") {
      let prods = [], shops = [];
      try {
        [prods, shops] = await Promise.all([rest("catalog_products?is_demo=eq.false&select=id,published_at&limit=5000"), rest("shops?is_demo=eq.false&select=slug,created_at&limit=2000")]);
      } catch (_) { /* un catalogue indisponible ne doit pas casser le plan de site */ }
      const x = [`<url><loc>${esc(u.origin)}/</loc></url>`, `<url><loc>${esc(u.origin)}/a-propos</loc></url>`, `<url><loc>${esc(u.origin)}/faq</loc></url>`, ...shops.map((s) => `<url><loc>${esc(u.origin)}/b/${esc(s.slug)}</loc></url>`), ...prods.map((p) => `<url><loc>${esc(u.origin)}/p/${esc(p.id)}</loc>${p.published_at ? `<lastmod>${esc(String(p.published_at).slice(0, 10))}</lastmod>` : ""}</url>`)];
      return secure(new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${x.join("")}</urlset>`, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } }));
    }
    if (u.pathname === "/robots.txt") return secure(new Response(`User-agent: *\nAllow: /\nDisallow: /qg/\nSitemap: ${u.origin}/sitemap.xml\n`, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } }));
    if ((m = u.pathname.match(/^\/erreur\/(\d{3})\/?$/))) return secure(errorPage(Number(m[1]), u.origin));
    if (u.pathname === "/erreur" || u.pathname === "/erreur/") return secure(errorPage(404, u.origin));
    if (u.pathname === "/" && req.method === "GET") return secure(await homeMeta(await env.ASSETS.fetch(req), u.origin));
    const out = secure(await env.ASSETS.fetch(req));
    if (out.status === 404) return secure(errorPage(404, u.origin));
    return out;
  },
};
