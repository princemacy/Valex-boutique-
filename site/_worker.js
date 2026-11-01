// VAlex — Cloudflare Pages (mode avancé). Rend chaque produit et chaque boutique lisible par Google
// et par WhatsApp/Facebook (photo + prix dans l'aperçu), puis ouvre le site normal.
// Aucune clé secrète ici : seulement la clé publique (publishable), déjà présente dans le site.
const SB = "https://amigpgmtbyfobbcjlave.supabase.co";
const KEY = "sb_publishable_OVLKYU3-9c-t_3UwY92UzQ_kxd1Z63Q";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const img = (bucket, p) => !p ? null : /^https?:/.test(p) ? p : `${SB}/storage/v1/object/public/${bucket}/${p}`;
const htg = (c) => Math.round((c || 0) / 100).toLocaleString("fr-FR") + " HTG";
async function rest(path) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, cf: { cacheTtl: 300, cacheEverything: true } });
  return r.ok ? r.json() : [];
}
function inject(res, { title, desc, image, url, jsonld, body, hash }) {
  const head = `<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="product"><meta property="og:site_name" content="VAlex Boutique"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">${image ? `<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image">` : ""}
<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>
<script>if(!location.hash)history.replaceState(null,"",location.pathname+"${hash}");</script>`;
  return new HTMLRewriter()
    .on("title", { element(e) { e.remove(); } })
    .on("head", { element(e) { e.append(head, { html: true }); } })
    .on("body", { element(e) { e.prepend(`<noscript><main style="font-family:sans-serif;padding:16px">${body}</main></noscript>`, { html: true }); } })
    .transform(res);
}
export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    const page = () => env.ASSETS.fetch(new Request(new URL("/", u), req));
    let m;
    if ((m = u.pathname.match(/^\/p\/([0-9a-f-]{36})\/?$/))) {
      const [p] = await rest(`catalog_products?id=eq.${m[1]}&is_demo=eq.false&select=id,title,description,min_price_cents,cover_path,shop_name,shop_slug,shop_city,total_stock,rating_avg,rating_count,category_label`);
      if (!p) return page();
      const image = img("product-images", p.cover_path), url = `${u.origin}/p/${p.id}`;
      const desc = `${htg(p.min_price_cents)} · ${p.shop_name}${p.shop_city ? " à " + p.shop_city : ""}. ${(p.description || "").slice(0, 140)}`;
      const jsonld = { "@context": "https://schema.org", "@type": "Product", name: p.title, description: p.description || p.title, image: image ? [image] : undefined, category: p.category_label,
        brand: { "@type": "Brand", name: p.shop_name },
        offers: { "@type": "Offer", url, priceCurrency: "HTG", price: Math.round((p.min_price_cents || 0) / 100), availability: (p.total_stock || 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", seller: { "@type": "Organization", name: p.shop_name } },
        ...(p.rating_count ? { aggregateRating: { "@type": "AggregateRating", ratingValue: p.rating_avg, reviewCount: p.rating_count } } : {}) };
      return inject(await page(), { title: `${p.title} — ${htg(p.min_price_cents)} | VAlex`, desc, image, url, jsonld, hash: `#/produit/${p.id}`,
        body: `<h1>${esc(p.title)}</h1><p><b>${htg(p.min_price_cents)}</b> — ${esc(p.shop_name)}, ${esc(p.shop_city || "")}</p>${image ? `<img src="${esc(image)}" alt="${esc(p.title)}" width="320">` : ""}<p>${esc(p.description || "")}</p><p><a href="/b/${esc(p.shop_slug)}">Voir la boutique ${esc(p.shop_name)}</a></p>` });
    }
    if ((m = u.pathname.match(/^\/b\/([a-z0-9-]{2,60})\/?$/))) {
      const [s] = await rest(`shops?slug=eq.${m[1]}&is_demo=eq.false&select=id,name,slug,activity,city,department,logo_url`);
      if (!s) return page();
      const prods = await rest(`catalog_products?shop_id=eq.${s.id}&is_demo=eq.false&select=id,title,min_price_cents&order=published_at.desc&limit=30`);
      const url = `${u.origin}/b/${s.slug}`, image = img("shop-logos", s.logo_url);
      return inject(await page(), { title: `${s.name} — boutique à ${s.city || "Haïti"} | VAlex`, desc: `${s.activity || "Boutique"} · ${prods.length} articles · ${s.city || ""} ${s.department || ""}. Commandez sur VAlex, paiement à la livraison possible.`,
        image, url, hash: `#/boutique/${s.slug}`,
        jsonld: { "@context": "https://schema.org", "@type": "Store", name: s.name, url, image, address: { "@type": "PostalAddress", addressLocality: s.city, addressRegion: s.department, addressCountry: "HT" } },
        body: `<h1>${esc(s.name)}</h1><p>${esc(s.activity || "")}</p><ul>${prods.map((p) => `<li><a href="/p/${p.id}">${esc(p.title)}</a> — ${htg(p.min_price_cents)}</li>`).join("")}</ul>` });
    }
    if (u.pathname === "/sitemap.xml") {
      const [prods, shops] = await Promise.all([rest("catalog_products?is_demo=eq.false&select=id,published_at&limit=5000"), rest("shops?is_demo=eq.false&select=slug,created_at&limit=2000")]);
      const x = [`<url><loc>${u.origin}/</loc></url>`, ...shops.map((s) => `<url><loc>${u.origin}/b/${s.slug}</loc></url>`), ...prods.map((p) => `<url><loc>${u.origin}/p/${p.id}</loc>${p.published_at ? `<lastmod>${p.published_at.slice(0, 10)}</lastmod>` : ""}</url>`)];
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${x.join("")}</urlset>`, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
    }
    if (u.pathname === "/robots.txt") return new Response(`User-agent: *\nAllow: /\nSitemap: ${u.origin}/sitemap.xml\n`, { headers: { "content-type": "text/plain" } });
    return env.ASSETS.fetch(req);
  },
};
