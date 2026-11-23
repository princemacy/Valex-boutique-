// VAlex - tableau de bord financier cote navigateur (p46).
//
// Lecture seule. `wallet_accounts`, `wallet_holds`, `withdrawal_requests`,
// `ledger_transactions`, `ledger_lines` et `fee_config` sont filtres par RLS.
// Aucune fonction de retrait, de versement, de remboursement ou de correction
// n'est appelee ici : cette page ne deplace pas d'argent.
import {
  LEDGER_PAGE_SIZE,
  accountLabel,
  assessFinanceAccess,
  buildLedger,
  formatRateBps,
  holdStatusLabel,
  kindLabel,
  normalizeAccounts,
  normalizeFees,
  normalizeHolds,
  normalizeWithdrawals,
  summarize,
  withdrawalStatusLabel,
} from "./finance-core.mjs";

function client() {
  if (typeof window === "undefined" || !window.sb) {
    throw new Error("client_indisponible");
  }
  return window.sb;
}

function missingModule(error) {
  const code = String((error && error.code) || "");
  const m = String((error && error.message) || "").toLowerCase();
  return (
    code === "42P01" ||
    code === "42883" ||
    code === "PGRST202" ||
    m.includes("does not exist") ||
    m.includes("could not find the function") ||
    m.includes("schema cache")
  );
}

async function authAal() {
  const auth = client().auth;
  if (!auth || !auth.mfa || typeof auth.mfa.getAuthenticatorAssuranceLevel !== "function") {
    return null;
  }
  try {
    const { data, error } = await auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return null;
    return data.currentLevel === "aal2" ? "aal2" : data.currentLevel === "aal1" ? "aal1" : null;
  } catch (_) {
    return null;
  }
}

export async function loadAccess() {
  const sb = client();
  let moduleAvailable = false;
  try {
    const { error } = await sb.from("wallet_accounts").select("id").limit(1);
    moduleAvailable = !error || !missingModule(error);
  } catch (_) {
    moduleAvailable = false;
  }

  let aal = null;
  try {
    const { data, error } = await sb.rpc("current_aal");
    if (!error && (data === "aal1" || data === "aal2")) aal = data;
  } catch (_) {
    aal = null;
  }
  if (!aal) aal = await authAal();

  let isOwner = false;
  try {
    const { data, error } = await sb.rpc("is_owner");
    if (!error) isOwner = data === true;
  } catch (_) {
    isOwner = false;
  }
  if (!isOwner) {
    // Avant p45, `admin` etait l'equivalent du proprietaire.
    try {
      const { data, error } = await sb.rpc("is_admin");
      if (!error) isOwner = data === true;
    } catch (_) {
      isOwner = false;
    }
  }

  return {
    moduleAvailable,
    isOwner,
    aal,
    access: assessFinanceAccess({ moduleAvailable, isOwner, aal }),
  };
}

const ACCOUNT_COLUMNS =
  "id,user_id,account_code,currency,available_cents,blocked_cents,allow_negative";

export async function loadOverview() {
  const sb = client();
  const [accounts, holds, withdrawals, fees] = await Promise.all([
    sb.from("wallet_accounts").select(ACCOUNT_COLUMNS),
    sb.from("wallet_holds").select("id,order_id,user_id,amount_cents,status,created_at"),
    sb
      .from("withdrawal_requests")
      .select("id,user_id,amount_cents,fee_cents,net_cents,provider,destination_masked,status,requested_at")
      .order("requested_at", { ascending: false })
      .limit(50),
    sb
      .from("fee_config")
      .select("code,label,rate_bps,payer,base,applies_to,provider,active,priority,notes")
      .order("priority"),
  ]);

  if (accounts.error && !missingModule(accounts.error)) {
    return { ok: false, error: accounts.error.message || "Lecture impossible." };
  }

  const accountList = normalizeAccounts(accounts.data);
  const holdList = normalizeHolds(holds.data);
  const withdrawalList = normalizeWithdrawals(withdrawals.data);
  const feeList = normalizeFees(fees.data);

  return {
    ok: true,
    accounts: accountList,
    holds: holdList,
    withdrawals: withdrawalList,
    fees: feeList,
    summary: summarize({
      accounts: accountList,
      holds: holdList,
      withdrawals: withdrawalList,
    }),
  };
}

export async function loadLedger({ limit = LEDGER_PAGE_SIZE } = {}) {
  const sb = client();
  const size = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : LEDGER_PAGE_SIZE;
  const { data: transactions, error } = await sb
    .from("ledger_transactions")
    .select("id,kind,amount_cents,order_id,memo,status,created_at")
    .order("created_at", { ascending: false })
    .limit(size);
  if (error) return [];

  const ids = (transactions || []).map((t) => t.id).filter(Boolean);
  let lines = [];
  if (ids.length) {
    const result = await sb
      .from("ledger_lines")
      .select("id,transaction_id,account_id,bucket,amount_cents")
      .in("transaction_id", ids);
    if (!result.error) lines = result.data || [];
  }

  const accounts = await sb.from("wallet_accounts").select(ACCOUNT_COLUMNS);
  return buildLedger({
    transactions,
    lines,
    accounts: accounts.data,
    limit: size,
  });
}

export {
  ACCOUNT_LABELS,
  HOLD_STATUS_LABELS,
  LEDGER_KIND_LABELS,
  LEDGER_PAGE_SIZE,
  PENDING_WITHDRAWAL_STATUSES,
  PLATFORM_CODES,
  WITHDRAWAL_STATUS_LABELS,
  accountLabel,
  assessFinanceAccess,
  buildLedger,
  formatRateBps,
  holdStatusLabel,
  kindLabel,
  normalizeAccount,
  normalizeAccounts,
  normalizeFee,
  normalizeFees,
  normalizeHold,
  normalizeHolds,
  normalizeTransaction,
  normalizeWithdrawal,
  normalizeWithdrawals,
  summarize,
  withdrawalStatusLabel,
} from "./finance-core.mjs";

const api = {
  loadAccess,
  loadOverview,
  loadLedger,
  formatRateBps,
  kindLabel,
  accountLabel,
  withdrawalStatusLabel,
  holdStatusLabel,
};

if (typeof window !== "undefined") {
  window.VAlexFinance = api;
}

export default api;
