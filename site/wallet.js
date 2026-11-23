// VAlex - portefeuille vendeur cote navigateur.
//
// MODULE HISTORIQUE NON CHARGE par le site depuis p59. Aucune page de solde,
// de depot ou de retrait client n'est exposee. Ne pas le rebrancher sans une
// decision explicite et une nouvelle validation serveur.
//
// Lecture seule des soldes et du grand livre. Le retrait passe par la RPC
// `withdrawal_request` (p46) avec une cle d'idempotence. Aucun calcul de
// solde n'est fait cote client : le serveur reste seul juge.
import {
  buildIdempotencyKey,
  formatCents,
  maskDestination,
  newIdempotencyKey,
  normalizeLedger,
  normalizeWallet,
  signedCents,
  transactionLabel,
  validateWithdrawal,
  WITHDRAWAL_PROVIDERS,
} from "./wallet-core.mjs";

function client() {
  if (typeof window === "undefined" || !window.sb) {
    throw new Error("client_indisponible");
  }
  return window.sb;
}

function cleanLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(1, Math.min(200, Math.floor(n)));
}

export async function load() {
  const { data, error } = await client().rpc("my_wallet");
  if (error) throw new Error("portefeuille_indisponible");
  return normalizeWallet(data);
}

export async function loadLedger(limit = 50) {
  const { data: lines, error } = await client().rpc("my_ledger", {
    p_limit: cleanLimit(limit),
  });
  if (error) throw new Error("portefeuille_indisponible");
  const rows = Array.isArray(lines) ? lines : [];
  const ids = [...new Set(rows.map((l) => l?.transaction_id).filter(Boolean))];
  let txs = [];
  if (ids.length) {
    const res = await client()
      .from("ledger_transactions")
      .select("id,kind,memo,order_id,created_at")
      .in("id", ids);
    if (!res.error) txs = res.data || [];
  }
  return normalizeLedger(rows, txs);
}

// Frais exacts calcules par le serveur (p46, `fee_quote`). Si la RPC manque,
// on renvoie null : l'interface affiche alors seulement le bareme indicatif.
export async function quote(amountCents) {
  const amount = Number(amountCents);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("montant_retrait_invalide");
  }
  const { data, error } = await client().rpc("fee_quote", {
    p_operation: "withdrawal",
    p_base_cents: amount,
    p_online: false,
    p_commercial: false,
  });
  if (error) return null;
  const fee = Number(data?.total_fee_cents);
  const net = Number(data?.net_cents);
  if (!Number.isInteger(fee) || !Number.isInteger(net)) return null;
  return { feeCents: fee, netCents: net };
}

export async function requestWithdrawal({
  amountCents,
  provider,
  destination,
  availableCents,
  idempotencyKey,
} = {}) {
  const clean = validateWithdrawal({
    amountCents,
    provider,
    destination,
    availableCents,
  });
  const key = idempotencyKey
    ? buildIdempotencyKey(idempotencyKey)
    : newIdempotencyKey();
  const { data, error } = await client().rpc("withdrawal_request", {
    p_amount_cents: clean.amountCents,
    p_provider: clean.provider,
    p_destination: clean.destination,
    p_idempotency_key: key,
  });
  if (error) throw new Error(error.message || "retrait_refuse");
  return { id: data, masked: clean.destinationMasked };
}

export async function loadWithdrawals() {
  const { data, error } = await client()
    .from("withdrawal_requests")
    .select("id,amount_cents,fee_cents,net_cents,provider,destination_masked,status,requested_at,note")
    .order("requested_at", { ascending: false })
    .limit(20);
  if (error) throw new Error("portefeuille_indisponible");
  return (Array.isArray(data) ? data : []).map((row) => ({
    id: String(row.id ?? ""),
    amountCents: Number(row.amount_cents) || 0,
    feeCents: Number(row.fee_cents) || 0,
    netCents: Number(row.net_cents) || 0,
    provider: row.provider === "natcash" ? "natcash" : "moncash",
    destinationMasked: String(row.destination_masked ?? ""),
    status: String(row.status ?? "requested"),
    requestedAt: typeof row.requested_at === "string" ? row.requested_at : null,
    note: typeof row.note === "string" ? row.note.slice(0, 200) : null,
  }));
}

export {
  buildIdempotencyKey,
  formatCents,
  maskDestination,
  normalizeLedger,
  normalizeWallet,
  signedCents,
  transactionLabel,
  validateWithdrawal,
  WITHDRAWAL_PROVIDERS,
};

const api = {
  load,
  loadLedger,
  loadWithdrawals,
  quote,
  requestWithdrawal,
  formatCents,
  signedCents,
  validateWithdrawal,
  WITHDRAWAL_PROVIDERS,
};

if (typeof window !== "undefined") {
  window.VAlexWallet = api;
}

export default api;
