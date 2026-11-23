#!/usr/bin/env node
// Controle de publication du site VAlex.
// 1. Aucun secret ne doit se trouver dans site/.
// 2. Le hash CSP de la page doit correspondre au script inline publie.
// 3. Les scripts doivent etre syntaxiquement valides.
// Sortie 0 = publication autorisee. Sortie 1 = publication refusee.

import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const ROOT = process.argv[2] || "site";
const errors = [];
const warnings = [];

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const files = walk(ROOT);
const textFiles = files.filter((f) => !/\.(png|jpg|jpeg|webp|gif|ico|woff2?|ttf|otf)$/i.test(f));

// ---------- 1. Secrets ----------
const RULES = [
  ["service_role", /service_role/g],
  ["cle secrete Supabase", /sb_secret_[A-Za-z0-9_-]{10,}/g],
  ["URL PostgreSQL", /postgres(?:ql)?:\/\//g],
  ["URL MySQL", /mysql:\/\//g],
  ["URL MongoDB", /mongodb(?:\+srv)?:\/\//g],
  ["URL Redis", /redis:\/\//g],
  ["cle OpenAI", /sk-[A-Za-z0-9_-]{20,}/g],
  ["cle Anthropic", /sk-ant-[A-Za-z0-9_-]{10,}/g],
  ["cle OpenRouter", /sk-or-v1-[A-Za-z0-9_-]{10,}/g],
  ["cle Google API", /AIza[0-9A-Za-z_-]{30,}/g],
  ["jeton GitHub", /gh[pousr]_[A-Za-z0-9]{30,}/g],
  ["jeton GitHub fin", /github_pat_[A-Za-z0-9_]{20,}/g],
  ["jeton GitLab", /glpat-[A-Za-z0-9_-]{16,}/g],
  ["jeton Slack", /xox[baprs]-[A-Za-z0-9-]{10,}/g],
  ["cle AWS", /AKIA[0-9A-Z]{16}/g],
  ["cle Stripe live", /sk_live_[A-Za-z0-9]{10,}/g],
  ["cle Stripe test", /sk_test_[A-Za-z0-9]{10,}/g],
  ["cle privee PEM", /BEGIN [A-Z ]*PRIVATE KEY/g],
  ["cle VAPID privee", /"privateKey"\s*:/g],
  ["en-tete Bearer", /Bearer\s+[A-Za-z0-9._-]{20,}/g],
  ["mot de passe en clair", /(?:password|passwd|pwd)\s*[=:]\s*["'][^"'\s]{6,}/gi],
];

const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
const SAFE_JWT = { iss: "supabase", role: "anon" };

for (const file of textFiles) {
  const text = readFileSync(file, "utf8");
  const lineAt = (i) => text.slice(0, i).split("\n").length;
  for (const [label, re] of RULES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      errors.push(`${relative(process.cwd(), file)}:${lineAt(m.index)} secret detecte (${label})`);
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  JWT_RE.lastIndex = 0;
  let j;
  while ((j = JWT_RE.exec(text))) {
    let payload = {};
    try {
      payload = JSON.parse(Buffer.from(j[0].split(".")[1], "base64url").toString("utf8"));
    } catch {
      errors.push(`${relative(process.cwd(), file)}:${lineAt(j.index)} JWT illisible`);
      continue;
    }
    if (payload.role !== SAFE_JWT.role || payload.iss !== SAFE_JWT.iss) {
      errors.push(
        `${relative(process.cwd(), file)}:${lineAt(j.index)} JWT non public (role=${payload.role})`
      );
    }
    if (j.index === JWT_RE.lastIndex) JWT_RE.lastIndex++;
  }
}

// ---------- 2. Hash CSP ----------
const indexPath = join(ROOT, "index.html");
const html = readFileSync(indexPath, "utf8");
const cdn = html.indexOf("supabase.js");
const startTag = html.indexOf("<script>", cdn);
const endTag = html.indexOf("</script>", startTag);
if (cdn < 0 || startTag < 0 || endTag < 0) {
  errors.push("index.html : script inline principal introuvable");
} else {
  const inline = html.slice(startTag + "<script>".length, endTag);
  const computed = "sha256-" + createHash("sha256").update(inline, "utf8").digest("base64");

  for (const f of ["_headers", "_worker.js"]) {
    const p = join(ROOT, f);
    const t = readFileSync(p, "utf8");
    const hashes = [...t.matchAll(/sha256-[A-Za-z0-9+/=]+/g)].map((x) => x[0]);
    if (!hashes.length) errors.push(`${f} : aucun hash CSP`);
    else if (!hashes.includes(computed))
      errors.push(`${f} : hash CSP perime (attendu ${computed}, trouve ${hashes.join(", ")})`);
  }
  for (const csp of [readFileSync(join(ROOT, "_headers"), "utf8"), readFileSync(join(ROOT, "_worker.js"), "utf8")]) {
    if (!csp.includes("script-src 'self'")) warnings.push("CSP sans script-src 'self'");
  }

  // ---------- 3. Syntaxe ----------
  const tmp = mkdtempSync(join(tmpdir(), "valex-site-"));
  const jsFile = join(tmp, "inline.js");
  writeFileSync(jsFile, inline);
  const check = spawnSync(process.execPath, ["--check", jsFile], { encoding: "utf8" });
  if (check.status !== 0) errors.push("script inline : " + (check.stderr || "").trim().split("\n").slice(0, 3).join(" | "));
  rmSync(tmp, { recursive: true, force: true });
}

for (const file of files.filter((f) => /\.(m?js)$/.test(f))) {
  const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (check.status !== 0) errors.push(`${relative(process.cwd(), file)} : ${(check.stderr || "").trim().split("\n")[0]}`);
}

// ---------- Rapport ----------
console.log(`Fichiers analyses : ${files.length} (${textFiles.length} textes)`);
for (const w of warnings) console.log("AVERTISSEMENT " + w);
if (errors.length) {
  console.error("\nPUBLICATION REFUSEE :");
  for (const e of errors) console.error(" - " + e);
  process.exit(1);
}
console.log("PUBLICATION AUTORISEE : aucun secret, hash CSP valide, syntaxe OK.");
