// VAlex - logique pure du tableau de bord financier (p46, lecture seule).
// Aucun mouvement d'argent. Aucun solde n'est calcule cote client a partir
// d'un prix : tous les montants viennent de `wallet_accounts`, du grand livre
// et des demandes de retrait, filtres par RLS.
//
// Convention :
//   - montants en centimes entiers (bigint cote serveur) ;
//   - `available_cents` = solde disponible, `blocked_cents` = fonds bloques ;
//   - `wallet_holds` est le detail par commande ; `blocked_cents` en est le
//     total, donc les deux ne s'additionnent jamais ;
//   - une transaction equilibree a une somme de lignes egale a zero.

export const ACCOUNT_LABELS = Object.freeze({
  valex_clearing: "Passage VAlex",
  valex_revenue: "Revenus VAlex",
  kobara_payable: "Dû à Kobara",
  withdrawal_clearing: "Passage retraits",
  refund_clearing: "Passage remboursements",
  ads_revenue: "Revenus publicité",
});

export const LEDGER_KIND_LABELS = Object.freeze({
  sale: "Vente",
  deposit: "Dépôt",
  withdrawal: "Retrait",
  payout: "Versement",
  reward: "Récompense",
  refund: "Remboursement",
  fee: "Frais",
  settlement: "Règlement",
  adjustment: "Correction",
  ads: "Publicité",
});

export const WITHDRAWAL_STATUS_LABELS = Object.freeze({
  requested: "Demandé",
  approved: "Approuvé",
  processing: "En cours",
  paid: "Payé",
  rejected: "Refusé",
  failed: "Échec",
});

export const HOLD_STATUS_LABELS = Object.freeze({
  held: "Bloqué",
  released: "Libéré",
  refunded: "Remboursé",
});

export const PENDING_WITHDRAWAL_STATUSES = Object.freeze([
  "requested",
  "approved",
  "processing",
]);

export const PLATFORM_CODES = Object.freeze(Object.keys(ACCOUNT_LABELS));

export const LEDGER_PAGE_SIZE = 20;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value, max) {
  return String(value ?? "")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function uuid(value) {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

function cents(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : 0;
}

function isoDate(value) {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

export function accountLabel(code) {
  if (!code) return "Compte";
  return ACCOUNT_LABELS[code] || cleanText(code, 40);
}

export function kindLabel(kind) {
  return LEDGER_KIND_LABELS[kind] || "Écriture";
}

export function withdrawalStatusLabel(status) {
  return WITHDRAWAL_STATUS_LABELS[status] || "Statut inconnu";
}

export function holdStatusLabel(status) {
  return HOLD_STATUS_LABELS[status] || "Statut inconnu";
}

export function normalizeAccount(row) {
  if (!isPlainObject(row)) return null;
  const id = uuid(row.id);
  if (!id) return null;
  const code = cleanText(row.account_code ?? row.code, 40) || null;
  const userId = uuid(row.user_id ?? row.userId);
  return {
    id,
    code,
    userId,
    label: code ? accountLabel(code) : userId ? "Compte vendeur" : "Compte",
    availableCents: cents(row.available_cents ?? row.availableCents),
    blockedCents: cents(row.blocked_cents ?? row.blockedCents),
    allowNegative: Boolean(row.allow_negative ?? row.allowNegative),
    isPlatform: !userId,
  };
}

export function normalizeAccounts(rows) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const account = normalizeAccount(row);
    if (!account || seen.has(account.id)) continue;
    seen.add(account.id);
    out.push(account);
  }
  return out.sort((a, b) => {
    if (a.isPlatform !== b.isPlatform) return a.isPlatform ? -1 : 1;
    const al = a.label.toLocaleLowerCase("fr");
    const bl = b.label.toLocaleLowerCase("fr");
    if (al !== bl) return al < bl ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function normalizeHold(row) {
  if (!isPlainObject(row)) return null;
  const id = uuid(row.id);
  const orderId = uuid(row.order_id ?? row.orderId);
  if (!id || !orderId) return null;
  const status = Object.prototype.hasOwnProperty.call(HOLD_STATUS_LABELS, row.status)
    ? row.status
    : "held";
  return {
    id,
    orderId,
    userId: uuid(row.user_id ?? row.userId),
    amountCents: cents(row.amount_cents ?? row.amountCents),
    status,
    statusLabel: holdStatusLabel(status),
    createdAt: isoDate(row.created_at ?? row.createdAt),
  };
}

export function normalizeHolds(rows) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const hold = normalizeHold(row);
    if (!hold || seen.has(hold.id)) continue;
    seen.add(hold.id);
    out.push(hold);
  }
  return out;
}

export function normalizeWithdrawal(row) {
  if (!isPlainObject(row)) return null;
  const id = uuid(row.id);
  if (!id) return null;
  const status = Object.prototype.hasOwnProperty.call(WITHDRAWAL_STATUS_LABELS, row.status)
    ? row.status
    : "requested";
  return {
    id,
    userId: uuid(row.user_id ?? row.userId),
    amountCents: cents(row.amount_cents ?? row.amountCents),
    feeCents: cents(row.fee_cents ?? row.feeCents),
    netCents: cents(row.net_cents ?? row.netCents),
    provider: cleanText(row.provider, 20) || null,
    destination: cleanText(row.destination_masked ?? row.destination, 40) || null,
    status,
    statusLabel: withdrawalStatusLabel(status),
    requestedAt: isoDate(row.requested_at ?? row.requestedAt),
  };
}

export function normalizeWithdrawals(rows) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const item = normalizeWithdrawal(row);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out.sort((a, b) => {
    const at = a.requestedAt ? Date.parse(a.requestedAt) : 0;
    const bt = b.requestedAt ? Date.parse(b.requestedAt) : 0;
    return bt - at;
  });
}

export function normalizeFee(row) {
  if (!isPlainObject(row)) return null;
  const code = cleanText(row.code, 40);
  if (!code) return null;
  const rateBps = Number(row.rate_bps ?? row.rateBps);
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10000) return null;
  return {
    code,
    label: cleanText(row.label, 80) || code,
    rateBps,
    rateLabel: formatRateBps(rateBps),
    payer: cleanText(row.payer, 20) || null,
    base: cleanText(row.base, 30) || null,
    appliesTo: Array.isArray(row.applies_to ?? row.appliesTo)
      ? (row.applies_to ?? row.appliesTo).filter((v) => typeof v === "string").slice(0, 12)
      : [],
    provider: cleanText(row.provider, 20) || null,
    active: Boolean(row.active),
    priority: Number.isInteger(Number(row.priority)) ? Number(row.priority) : 100,
    notes: cleanText(row.notes, 400) || null,
  };
}

export function normalizeFees(rows) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const fee = normalizeFee(row);
    if (!fee || seen.has(fee.code)) continue;
    seen.add(fee.code);
    out.push(fee);
  }
  return out.sort((a, b) => a.priority - b.priority);
}

// 50 bps -> "0,50 %" ; 390 -> "3,90 %" ; 500 -> "5 %".
export function formatRateBps(bps) {
  const n = Number(bps);
  if (!Number.isFinite(n) || n < 0 || n > 10000) return "—";
  if (n % 100 === 0) return `${n / 100} %`;
  return `${(n / 100).toFixed(2).replace(".", ",")} %`;
}

export function summarize({ accounts, holds, withdrawals } = {}) {
  const list = normalizeAccounts(accounts);
  const holdsList = normalizeHolds(holds);
  const withdrawalsList = normalizeWithdrawals(withdrawals);

  const platform = list.filter((a) => a.isPlatform);
  const sellers = list.filter((a) => !a.isPlatform);
  const pending = withdrawalsList.filter((w) =>
    PENDING_WITHDRAWAL_STATUSES.includes(w.status),
  );

  return {
    accountCount: list.length,
    platformCount: platform.length,
    sellerCount: sellers.length,
    platformAvailableCents: platform.reduce((sum, a) => sum + a.availableCents, 0),
    platformBlockedCents: platform.reduce((sum, a) => sum + a.blockedCents, 0),
    sellerAvailableCents: sellers.reduce((sum, a) => sum + a.availableCents, 0),
    sellerBlockedCents: sellers.reduce((sum, a) => sum + a.blockedCents, 0),
    heldOrders: holdsList.filter((h) => h.status === "held").length,
    heldCents: holdsList
      .filter((h) => h.status === "held")
      .reduce((sum, h) => sum + h.amountCents, 0),
    pendingWithdrawals: pending.length,
    pendingWithdrawalsCents: pending.reduce((sum, w) => sum + w.amountCents, 0),
    platform,
    sellers,
    withdrawals: withdrawalsList,
  };
}

export function normalizeTransaction(row) {
  if (!isPlainObject(row)) return null;
  const id = uuid(row.id);
  if (!id) return null;
  const kind = Object.prototype.hasOwnProperty.call(LEDGER_KIND_LABELS, row.kind)
    ? row.kind
    : null;
  if (!kind) return null;
  return {
    id,
    kind,
    kindLabel: kindLabel(kind),
    amountCents: cents(row.amount_cents ?? row.amountCents),
    orderId: uuid(row.order_id ?? row.orderId),
    memo: cleanText(row.memo, 200) || null,
    status: row.status === "reversed" ? "reversed" : "posted",
    createdAt: isoDate(row.created_at ?? row.createdAt),
  };
}

export function normalizeLine(row) {
  if (!isPlainObject(row)) return null;
  const id = String(row.id ?? "").trim();
  const transactionId = uuid(row.transaction_id ?? row.transactionId);
  const accountId = uuid(row.account_id ?? row.accountId);
  if (!id || !transactionId || !accountId) return null;
  const amount = cents(row.amount_cents ?? row.amountCents);
  if (amount === 0) return null;
  return {
    id,
    transactionId,
    accountId,
    bucket: row.bucket === "blocked" ? "blocked" : "available",
    amountCents: amount,
  };
}

// Assemble les transactions avec leurs lignes et verifie l'equilibre.
export function buildLedger({ transactions, lines, accounts, limit } = {}) {
  const accountById = {};
  for (const account of normalizeAccounts(accounts)) accountById[account.id] = account;

  const byTx = {};
  for (const row of Array.isArray(lines) ? lines : []) {
    const line = normalizeLine(row);
    if (!line) continue;
    (byTx[line.transactionId] = byTx[line.transactionId] || []).push(line);
  }

  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(transactions) ? transactions : []) {
    const tx = normalizeTransaction(row);
    if (!tx || seen.has(tx.id)) continue;
    seen.add(tx.id);
    const txLines = (byTx[tx.id] || [])
      .slice()
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((line) => ({
        ...line,
        accountLabel: (accountById[line.accountId] || {}).label || "Compte",
        bucketLabel: line.bucket === "blocked" ? "bloqué" : "disponible",
      }));
    const total = txLines.reduce((sum, line) => sum + line.amountCents, 0);
    out.push({
      ...tx,
      lines: txLines,
      lineCount: txLines.length,
      balanced: txLines.length > 0 && total === 0,
      totalCents: total,
    });
  }
  out.sort((a, b) => {
    const at = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bt = b.createdAt ? Date.parse(b.createdAt) : 0;
    if (at !== bt) return bt - at;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
  const max = Number.isInteger(limit) && limit > 0 ? limit : LEDGER_PAGE_SIZE;
  return out.slice(0, max);
}

// Acces : le tableau de bord financier est reserve au proprietaire, avec MFA.
export function assessFinanceAccess({ moduleAvailable, isOwner, aal } = {}) {
  if (!moduleAvailable) {
    return {
      ok: false,
      reason: "module_absent",
      title: "Les finances ne sont pas encore activées",
      message:
        "Les comptes et le grand livre ne sont pas installés sur le serveur. Aucun chiffre n'est inventé.",
    };
  }
  if (!isOwner) {
    return {
      ok: false,
      reason: "not_owner",
      title: "Accès réservé au propriétaire",
      message: "Seul le propriétaire peut consulter l'ensemble des comptes.",
    };
  }
  if (aal !== "aal2") {
    return {
      ok: false,
      reason: "mfa_required",
      title: "Double vérification requise",
      message: "Activez la double vérification dans le QG, puis revenez ici.",
    };
  }
  return {
    ok: true,
    reason: "ready",
    title: "Finances accessibles",
    message: "Vue en lecture seule : aucun mouvement n'est déclenché depuis cette page.",
  };
}
