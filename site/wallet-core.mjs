// VAlex - logique pure du portefeuille.
// Aucun acces reseau, aucun mouvement d'argent.
//
// Contrat p46 :
//   - `my_wallet()` renvoie les soldes en centimes entiers ;
//   - `fee_quote('withdrawal', montant)` calcule les frais ;
//   - `withdrawal_request(...)` exige un montant >= 1 000 centimes, un
//     fournisseur moncash/natcash, un numero d'au moins 8 chiffres et une
//     cle d'idempotence d'au moins 8 caracteres.

export const MIN_WITHDRAWAL_CENTS = 1000;
export const WITHDRAWAL_PROVIDERS = Object.freeze(["moncash", "natcash"]);

const CURRENCY_RE = /^[A-Z]{3}$/;

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

export function formatCents(cents) {
  const value = toInt(cents);
  if (value === null || value < 0) return "—";
  const units = Math.floor(value / 100);
  const rest = String(value % 100).padStart(2, "0");
  return `${units.toLocaleString("fr-FR")},${rest} HTG`;
}

export function normalizeWallet(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("portefeuille_invalide");
  }
  const currency = String(value.currency ?? "HTG").trim().toUpperCase();
  if (!CURRENCY_RE.test(currency)) throw new Error("devise_invalide");
  const available = toInt(value.available_cents);
  const blocked = toInt(value.blocked_cents);
  const withdrawable = toInt(value.withdrawable_cents);
  const holds = toInt(value.holds_cents);
  if ([available, blocked, withdrawable, holds].some((n) => n === null || n < 0)) {
    throw new Error("solde_invalide");
  }
  return {
    currency,
    availableCents: available,
    blockedCents: blocked,
    withdrawableCents: withdrawable,
    holdsCents: holds,
  };
}

export function normalizeDestination(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function maskDestination(value) {
  const digits = normalizeDestination(value);
  if (digits.length < 4) return "";
  return "****" + digits.slice(-4);
}

// Valide la saisie avant l'appel serveur. Le serveur reste seul juge du
// solde, des frais et du net.
export function validateWithdrawal({
  amountCents,
  provider,
  destination,
  availableCents,
} = {}) {
  const amount = toInt(amountCents);
  if (amount === null || amount < MIN_WITHDRAWAL_CENTS) {
    throw new Error("montant_retrait_trop_faible");
  }
  const available = toInt(availableCents);
  if (available !== null && amount > available) {
    throw new Error("solde_insuffisant");
  }
  if (!WITHDRAWAL_PROVIDERS.includes(provider)) {
    throw new Error("fournisseur_retrait_inconnu");
  }
  const digits = normalizeDestination(destination);
  if (digits.length < 8 || digits.length > 15) {
    throw new Error("numero_retrait_invalide");
  }
  return {
    amountCents: amount,
    provider,
    destination: digits,
    destinationMasked: maskDestination(digits),
  };
}

export function buildIdempotencyKey(randomText) {
  const raw = String(randomText ?? "").replace(/[^A-Za-z0-9-]/g, "");
  if (raw.length < 8) throw new Error("cle_idempotence_invalide");
  return raw.slice(0, 64);
}

export function newIdempotencyKey() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return "wd-" + cryptoApi.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
    return "wd-" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("aleatoire_indisponible");
}

const TX_LABELS = Object.freeze({
  sale: "Vente",
  deposit: "Depot",
  withdrawal: "Retrait",
  payout: "Versement",
  reward: "Recompense",
  refund: "Remboursement",
  fee: "Frais",
  settlement: "Reglement",
  adjustment: "Correction",
  ads: "Publicite",
});

export function transactionLabel(kind) {
  return TX_LABELS[String(kind ?? "")] || "Mouvement";
}

function isUuid(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value);
}

// Associe chaque ligne du grand livre a sa transaction. Une ligne sans
// transaction connue reste affichee comme mouvement generique.
export function normalizeLedger(lines, transactions = []) {
  const byTx = new Map();
  for (const tx of Array.isArray(transactions) ? transactions : []) {
    if (!tx || !isUuid(tx.id)) continue;
    byTx.set(tx.id, tx);
  }
  const out = [];
  for (const line of Array.isArray(lines) ? lines : []) {
    if (!line || typeof line !== "object") continue;
    const amount = toInt(line.amount_cents);
    if (amount === null || amount === 0) continue;
    const txId = isUuid(line.transaction_id) ? line.transaction_id : null;
    const tx = txId ? byTx.get(txId) : null;
    const created = typeof line.created_at === "string" ? line.created_at : null;
    out.push({
      id: String(line.id ?? ""),
      transactionId: txId,
      amountCents: amount,
      direction: amount > 0 ? "credit" : "debit",
      bucket: line.bucket === "blocked" ? "blocked" : "available",
      kind: tx ? String(tx.kind ?? "") : "",
      label: transactionLabel(tx?.kind),
      memo: typeof tx?.memo === "string" ? tx.memo.slice(0, 200) : null,
      createdAt: created && !Number.isNaN(Date.parse(created)) ? created : null,
    });
  }
  return out;
}

export function signedCents(amountCents) {
  const value = toInt(amountCents);
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "−";
  return sign + formatCents(Math.abs(value));
}
