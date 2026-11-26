import test from "node:test";
import assert from "node:assert/strict";
import {
  BASE_CAPABILITIES,
  OPTIONAL_PERMISSIONS,
  canCancelInvitation,
  canRetryInvitation,
  normalizeActivityLog,
  normalizeDashboard,
  normalizeInvitation,
  normalizeInvitations,
  normalizePartnerShops,
  normalizePermissions,
  validateInviteEmail,
  validatePermissionPatch,
} from "../site/influencer-core.mjs";
import { cancelInvitation, loadDashboard, sendInvitation, updateShopPermissions } from "../site/influencer-api.js";

const SHOP_ID = "c1a8a11e-9c2a-4a10-8f88-30b33f8c11a1";

test("refuse une invitation sans adresse email valide", () => {
  for (const value of ["", "not-an-email", "x@", "a b@example.com"]) {
    assert.throws(() => validateInviteEmail(value), /email_invitation_invalide/);
  }
  assert.equal(validateInviteEmail(" Marchand@Example.HT "), "marchand@example.ht");
});

test("normalise seulement les statuts d'invitation connus et ne retourne jamais de token", () => {
  const item = normalizeInvitation({ id: "inv-1", email: "Shop@example.ht", status: "pending", token: "secret-token", invite_url: "https://bad" });
  assert.equal(item.email, "shop@example.ht");
  assert.equal(item.statusLabel, "En attente");
  assert.equal("token" in item, false);
  assert.equal("invite_url" in item, false);
  assert.equal(normalizeInvitation({ id: "bad", status: "unknown" }), null);
  assert.equal(normalizeInvitations([{ id: "inv-1", status: "expired" }, { id: "inv-1", status: "pending" }]).length, 1);
});

test("états de renvoi et d'annulation restent bornés", () => {
  assert.equal(canRetryInvitation({ status: "send_error" }), true);
  assert.equal(canRetryInvitation({ status: "accepted" }), false);
  assert.equal(canCancelInvitation({ status: "pending" }), true);
  assert.equal(canCancelInvitation({ status: "expired" }), false);
});

test("dashboard affiche uniquement les métriques du serveur sans calcul ni valeur de repli", () => {
  const view = normalizeDashboard({
    counts: { invitations_sent: 2, shops_approved: 1 },
    commissions: { pending: { amount_cents: 400, currency: "GDS" } },
  });
  assert.equal(view.counts.invitationsSent, 2);
  assert.equal(view.counts.invitationsAccepted, null);
  assert.equal(view.commissions.pending.amountCents, 400);
  assert.equal(view.commissions.available, null);
  assert.equal(normalizeDashboard(null), null);
});

test("permissions facultatives utilisent une liste blanche sans privilèges sensibles", () => {
  assert.deepEqual(validatePermissionPatch({ stock_manage: true, messages_reply: false }), {
    stock_manage: true,
    messages_reply: false,
  });
  assert.throws(() => validatePermissionPatch({ payment_manage: true }), /permission_interdite/);
  assert.throws(() => validatePermissionPatch({ wallet_manage: true }), /permission_interdite/);
  assert.throws(() => validatePermissionPatch({ stock_manage: "yes" }), /permissions_invalides/);
  assert.ok(BASE_CAPABILITIES.length > 0);
  assert.deepEqual(OPTIONAL_PERMISSIONS, ["stock_manage", "prices_manage", "orders_manage", "delivery_manage", "messages_reply"]);
  const normalized = normalizePermissions({ base: { products_create: true }, optional: { stock_manage: true, payment_manage: true } });
  assert.equal(normalized.base.products_create, true);
  assert.equal(normalized.optional.stock_manage, true);
  assert.equal("payment_manage" in normalized.optional, false);
});

test("les boutiques et événements ne synthétisent aucune donnée absente", () => {
  assert.deepEqual(normalizePartnerShops([]), []);
  const shop = normalizePartnerShops([{ id: SHOP_ID, name: "Boutique", status: "approved" }])[0];
  assert.equal(shop.productCount, null);
  assert.equal(shop.commissions.pending, null);
  assert.equal(shop.delegationActive, null);
  assert.deepEqual(normalizeActivityLog([{ id: "a1", kind: "payment_destination_changed" }]), []);
});

test("les appels API déclarent clairement les fonctions absentes et n'annoncent aucun succès", async () => {
  globalThis.window = { sb: {
    rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }),
    functions: { invoke: async () => ({ data: null, error: { code: "404", message: "Not found" } }) },
  } };
  try {
    await assert.rejects(loadDashboard(), (error) => error.missing === true && error.userMessage.includes("pas encore activé"));
    await assert.rejects(sendInvitation("shop@example.ht"), (error) => error.missing === true);
    await assert.rejects(cancelInvitation("inv-1"), (error) => error.missing === true);
    await assert.rejects(updateShopPermissions(SHOP_ID, { payment_manage: true }), /permission_interdite/);
  } finally {
    delete globalThis.window;
  }
});

test("révocation refuse sans confirmation explicite", async () => {
  globalThis.window = { sb: { rpc: async () => ({ data: true, error: null }) } };
  try {
    const { revokeShopDelegation } = await import("../site/influencer-api.js");
    await assert.rejects(revokeShopDelegation(SHOP_ID, false), /confirmation_requise/);
  } finally {
    delete globalThis.window;
  }
});
