import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

import {
  AD_SLOT_COUNT,
  buildAdDisplay,
  formatCents,
  normalizeAdRows,
} from "../site/ads-core.mjs";

const site = (name) => readFileSync(new URL(`../site/${name}`, import.meta.url), "utf8");
const repoFile = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const repoExists = (path) => existsSync(new URL(`../${path}`, import.meta.url));

test("le formateur public n'affiche que des GDS", () => {
  assert.equal(formatCents(0), "0,00 GDS");
  assert.equal(formatCents(1500), "15,00 GDS");
  assert.equal(formatCents(150000), "1500,00 GDS");
  assert.equal(formatCents(-1), "—");
  assert.equal(formatCents("x"), "—");
  for (const text of [formatCents(1500), formatCents(123456)]) {
    assert.match(text, / GDS$/);
    assert.doesNotMatch(text, /HTG|USD|DOLA|\$/i);
  }
});

test("les publicites ne retiennent que les emplacements payants complets", () => {
  const rows = [
    { slot_no: 1, kind: "paid", title: "VAlex", shop_name: "VAlex", tier: "standard" },
    { slot_no: 2, kind: "paid", title: "VAlex", shop_name: "VAlex", tier: "standard" },
    {
      slot_no: 3,
      kind: "paid",
      title: "Sac en cuir",
      shop_name: "Boutique A",
      target_url: "/p/sac",
      image_path: "product-images/sac.jpg",
      tier: "premium",
      remaining_seconds: 7200,
    },
    {
      slot_no: 3,
      kind: "paid",
      title: "Doublon",
      shop_name: "Boutique B",
      target_url: "/p/double",
      image_path: "product-images/b.jpg",
      tier: "standard",
    },
    { slot_no: 4, kind: "house", title: "Maison", shop_name: "VAlex", tier: "standard" },
    { slot_no: 5, kind: "paid", title: "Sans boutique", shop_name: "", tier: "standard" },
    { slot_no: 6, kind: "paid", title: "Sans tier", shop_name: "Boutique C", tier: null },
    { slot_no: 11, kind: "paid", title: "Hors plage", shop_name: "Boutique D", tier: "standard" },
  ];
  const display = buildAdDisplay(rows);
  assert.equal(display.paid.length, 1);
  assert.equal(display.filled, 1);
  assert.equal(display.total, AD_SLOT_COUNT);
  assert.equal(display.paid[0].shopName, "Boutique A");
  assert.equal(display.paid[0].slotNo, 3);
  assert.equal(display.paid[0].title, "Sac en cuir");
});

test("aucun bloc publicitaire sans campagne payante reelle", () => {
  assert.deepEqual(normalizeAdRows([]), []);
  assert.deepEqual(normalizeAdRows(null), []);
  const display = buildAdDisplay([]);
  assert.equal(display.paid.length, 0);
  assert.equal(display.filled, 0);
  assert.equal(display.total, 10);
  const html = site("ads.js");
  assert.doesNotMatch(html, /Annonce de la maison/i);
  assert.doesNotMatch(html, /emplacements? actifs?/i);
  assert.doesNotMatch(html, /["'>]PUBLICIT[ÉE][<"']/);
});

test("le prix Pro vient de la base, plus d'offre annuelle ni de tarif invente", () => {
  const html = site("index.html");
  assert.doesNotMatch(html, /const PRO=/);
  assert.doesNotMatch(html, /VALEX_PAY/);
  assert.doesNotMatch(html, /2 mois offerts/i);
  assert.doesNotMatch(html, /15 questions par jour/i);
  assert.doesNotMatch(html, /3X XX XX XX/);
  assert.doesNotMatch(html, /valex_cur|USD_HTG/);
  for (const table of ["pro_plans", "credit_packs", "credit_costs", "pro_capacity_prices"]) {
    assert.ok(html.includes(table), `table attendue : ${table}`);
  }
  assert.match(html, /amount_cents:Math\.round\(Number\(amount\)\*100\)/);
  assert.doesNotMatch(html, /months===12|1 an ·|\/ an :/);
});

test("une seule inscription du service worker dans tout le site", () => {
  const pwa = site("pwa.js");
  const push = site("push.js");
  const html = site("index.html");
  assert.match(pwa, /navigator\.serviceWorker\s*\.register\(SW_URL/);
  assert.doesNotMatch(push, /serviceWorker\.register/);
  assert.doesNotMatch(html, /serviceWorker\.register/);
  assert.match(push, /getRegistration as pwaRegistration/);
});

test("le cache hors ligne ne contient aucune donnee Supabase ou privee", () => {
  const sw = site("sw.js");
  const cacheBlock = sw.slice(sw.indexOf("const PRECACHE"), sw.indexOf("];") + 2);
  assert.doesNotMatch(cacheBlock, /supabase/i);
  assert.doesNotMatch(cacheBlock, /rest\/v1|auth\/v1|functions\/v1/i);
  assert.doesNotMatch(cacheBlock, /wallet|commande|order|profil|message/i);
  assert.match(sw, /valex-static-v1/);
  assert.match(sw, /request\.mode === "navigate"/);
});

test("Google GIS utilise un nonce et signInWithIdToken, avec repli OAuth", () => {
  const html = site("index.html");
  assert.match(html, /accounts\.google\.com\/gsi\/client\?hl=fr/);
  assert.match(html, /signInWithIdToken\(\{provider:'google',token:res\.credential,nonce:rawNonce\}\)/);
  assert.match(html, /crypto\.getRandomValues\(new Uint8Array\(32\)\)/);
  assert.match(html, /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(html, /Continuer avec Google/);
  assert.match(html, /signInWithOAuth\(\{provider:'google'/);
  assert.match(html, /use_fedcm_for_prompt:false/);
});

test("le hash CSP reste synchronise entre index.html, _headers et _worker.js", () => {
  const html = site("index.html");
  const cdn = html.indexOf("supabase.js");
  const start = html.indexOf("<script>", cdn);
  const end = html.indexOf("</script>", start);
  assert.ok(cdn > 0 && start > 0 && end > start);
  const inline = html.slice(start + "<script>".length, end);
  const expected = "sha256-" + createHash("sha256").update(inline, "utf8").digest("base64");
  for (const name of ["_headers", "_worker.js"]) {
    const text = site(name);
    assert.ok(text.includes(expected), `${name} ne contient pas ${expected}`);
    assert.ok(text.includes("https://accounts.google.com"), `${name} n'autorise pas Google GIS`);
    assert.ok(text.includes("frame-src https://accounts.google.com"), `${name} n'autorise pas le cadre Google`);
    assert.ok(text.includes("frame-ancestors 'none'"), `${name} n'a plus frame-ancestors`);
  }
});

test("les routes publiques de consentement restent declarees", () => {
  const html = site("index.html");
  assert.match(html, /'confidentialite'/);
  assert.match(html, /'conditions'/);
  assert.match(html, /VAlex Boutique/);
});


test("la migration ad_home expose le vrai nom de boutique sans donnee privee", () => {
  const sql = repoFile("sql/2026-11-24-ad-home-shop-name.sql");
  assert.match(sql, /APPLIQUEE en production le 25 novembre 2026/);
  assert.match(sql, /20261125113318/);
  assert.match(sql, /pg_get_function_result\('public\.ad_home\(\)'::regprocedure\)/);
  assert.doesNotMatch(
    sql,
    /information_schema\.columns[\s\S]{0,120}table_name = 'ad_home'/,
    "ad_home est une fonction : information_schema.columns ne la voit pas",
  );
  assert.match(sql, /shop_id uuid/);
  assert.match(sql, /shop_name text/);
  assert.match(sql, /slot_no between 3 and 10/);
  assert.match(sql, /moderation_status = 'approved'/);
  assert.match(sql, /sh\.status = 'approved'/);
  assert.match(sql, /sh\.is_demo = false/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path to 'pg_catalog'/);
  assert.match(sql, /revoke all on function public\.ad_home\(\) from public/);
  assert.match(sql, /grant execute on function public\.ad_home\(\) to anon, authenticated, service_role/);
  assert.doesNotMatch(sql, /amount_cents|wallet_id|pay_ref/i);
});

test("le durcissement finance applique est documente et limite la lecture", () => {
  const sql = repoFile("sql/2026-11-25-secure-finance-access.sql");
  assert.match(sql, /20261125113651/);
  assert.match(sql, /secure_finance_fee_config_access/);
  assert.match(sql, /REVOKE SELECT ON TABLE public\.fee_config FROM anon/);
  assert.match(sql, /CREATE POLICY fee_config_owner_aal2_select/);
  assert.match(sql, /USING \(public\.is_owner\(\)\)/);
  assert.match(sql, /REVOKE SELECT ON TABLE public\.credit_hold_lines FROM anon, authenticated/);
  assert.match(sql, /REVOKE SELECT ON TABLE public\.pro_capacity_bonus_override FROM anon, authenticated/);
  assert.match(sql, /NOTIFY pgrst, 'reload schema'/);
  assert.doesNotMatch(sql, /GRANT SELECT ON TABLE public\.fee_config/);
});

test("le rollback finance est archive avec un avertissement explicite", () => {
  const sql = repoFile("sql/archive/finance_rls_rollback_2026-11-25.sql");
  assert.match(sql, /NON APPLIQUEE/);
  assert.match(sql, /rollback est PARTIEL/);
  assert.match(sql, /RLS reste active/);
  assert.match(sql, /les GRANT seuls ne/);
  assert.match(sql, /aucune ligne lisible/);
  assert.match(sql, /pg_policies/);
  assert.match(sql, /autorisation explicite/);
  assert.match(sql, /DROP POLICY IF EXISTS fee_config_owner_aal2_select/);
  assert.match(sql, /GRANT SELECT ON TABLE public\.fee_config TO anon, authenticated/);
  assert.match(sql, /GRANT SELECT ON TABLE public\.credit_hold_lines TO anon, authenticated/);
  assert.match(sql, /GRANT SELECT ON TABLE public\.pro_capacity_bonus_override TO anon, authenticated/);
});

test("le rollback ad_home restaure l'ancien contrat sans shop_name", () => {
  const sql = repoFile("sql/archive/ad_home_2026-11-23.sql");
  assert.match(sql, /drop function if exists public\.ad_home\(\)/);
  assert.match(sql, /remaining_seconds bigint/);
  assert.doesNotMatch(sql, /shop_name text/);
  assert.match(sql, /grant execute on function public\.ad_home\(\) to anon, authenticated, service_role/);
});

test("GitHub Actions verifie sans deployer, Workers Builds reste le seul deploiement", () => {
  const verify = repoFile(".github/workflows/verify.yml");
  assert.match(verify, /npm ci --no-audit --no-fund/);
  assert.match(verify, /npm run check/);
  assert.match(verify, /npm test/);
  assert.match(verify, /npm run dry-run/);
  assert.doesNotMatch(verify, /wrangler deploy(?! --dry-run)/);
  assert.doesNotMatch(verify, /CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID/);
  assert.equal(repoExists(".github/workflows/publish.yml"), false);
});

test("le mode hors ligne bloque les mutations Supabase", () => {
  const pwa = site("pwa.js");
  assert.match(pwa, /navigator\.onLine === false/);
  assert.match(pwa, /const mutating = method !== "GET" && method !== "HEAD"/);
  assert.ok(pwa.includes("supabase\\.co"));
  assert.ok(pwa.includes('new DOMException("Hors ligne", "NetworkError")'));
});

test("un chargement bloque propose Reessayer au lieu d'un skeleton infini", () => {
  const html = site("index.html");
  assert.match(html, /\.loadslow\{/);
  assert.match(html, /Le chargement prend plus de temps que prévu/);
  assert.match(html, /btn\.textContent='Réessayer'/);
  assert.match(html, /querySelectorAll\('\.sk, #feedL > \.feed__item > \.spin, \.msgs > \.spin'\)/);
  assert.match(html, /Aucune vidéo disponible/);
});

test("les cartes publicitaires utilisent textContent et le vrai nom de boutique", () => {
  const js = site("ads.js");
  assert.match(js, /node\(doc, "strong", "adcard__title", ad\.title\)/);
  assert.match(js, /"de " \+ ad\.shopName/);
  // Le commentaire d'en-tete mentionne innerHTML : on verifie les affectations
  // reelles, pas le mot dans la documentation du module.
  assert.doesNotMatch(js, /\.innerHTML\s*=/);
  assert.doesNotMatch(js, /insertAdjacentHTML|outerHTML\s*=/);
});

test("les erreurs utilisateur sont neutres et les logs masques", () => {
  const html = site("index.html");
  assert.match(html, /const id='VX-'/);
  assert.match(html, /\[masque\]/);
  assert.match(html, /toast\(msg\+' Code '\+id\+'\.'\)/);
  assert.doesNotMatch(html, /toast\(raw\)/);
});
