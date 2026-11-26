// VAlex — interface du programme partenaire dans le SPA existant.
// Aucune création de compte, de boutique, de permission ou donnée financière.
import * as API from "./influencer-api.js";

const PARTNER_ROUTE = "#/espace-partenaire";
const INVITE_ROUTE = "#/invitation";
const state = { dashboard: null, invitations: [], shops: [], loading: false, error: "", notice: "", session: null, token: null, invitation: null };

function el(tag, text = "", cls = "") { const n = document.createElement(tag); if (text !== "") n.textContent = text; if (cls) n.className = cls; return n; }
function btn(text, cls, action) { const b = el("button", text, cls); b.type = "button"; b.addEventListener("click", action); return b; }
function msg(text, kind = "info") { const p = el("p", text, `influencer-message influencer-message--${kind}`); p.setAttribute("role", kind === "error" ? "alert" : "status"); return p; }
function card(title, description = "") { const s = el("section", "", "card influencer-card"), h = el("div", "", "card__h"), b = el("div", "", "card__b"); h.appendChild(el("h2", title, "t-h3")); s.append(h, b); if (description) b.appendChild(el("p", description, "t-sub")); return { s, b }; }
function dateLabel(value) { if (!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-FR"); }
function head(title, subtitle) { const h = el("header", "", "phead influencer-head"), t = el("div", "", "phead__t"); t.append(el("h1", title), el("p", subtitle)); h.appendChild(t); return h; }
function metric(label, value) { const n = el("div", "", "influencer-metric"); n.append(el("strong", value == null ? "—" : String(value)), el("span", label)); return n; }
function status(label) { return el("span", label || "Statut inconnu", "influencer-status"); }

async function session() {
  const sb = window.sb;
  if (!sb?.auth?.getUser) return null;
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email || null, confirmed: Boolean(data.user.email_confirmed_at) };
}
function parseRoute() {
  const hash = String(location.hash || "");
  if (hash.startsWith("#/invitation/")) {
    state.token = hash.slice("#/invitation/".length).split(/[?#]/)[0] || null;
    history.replaceState(null, "", location.pathname + location.search + INVITE_ROUTE);
    return INVITE_ROUTE;
  }
  if (hash === INVITE_ROUTE) return INVITE_ROUTE;
  if (hash === PARTNER_ROUTE) return PARTNER_ROUTE;
  return "";
}
function showError(error) {
  state.error = error?.userMessage || "Le programme partenaire est indisponible. Aucune action n’a été confirmée.";
  state.notice = "";
}

async function mutate(operation, success) {
  try {
    const result = await operation();
    if (!result || result.ok !== true) throw new Error("Opération non confirmée par le serveur.");
    state.notice = success; state.error = "";
    await refreshPartner();
  } catch (error) { showError(error); renderPartner(); }
}

function invitationsView(host) {
  if (!state.invitations.length) { host.appendChild(msg("Aucune invitation réelle renvoyée par le serveur.", "empty")); return; }
  const list = el("ul", "", "influencer-list");
  for (const invite of state.invitations) {
    const row = el("li", "", "influencer-row"), main = el("div", "", "influencer-row__main");
    main.append(el("strong", invite.email || "Adresse masquée"), status(invite.statusLabel));
    main.appendChild(el("span", `Créée le ${dateLabel(invite.createdAt)} · expire le ${dateLabel(invite.expiresAt)}`, "t-small")); row.appendChild(main);
    if (["pending", "send_error"].includes(invite.status)) row.appendChild(btn("Renvoyer", "btn btn--sm", () => mutate(() => API.resendInvitation(invite.id), "Renvoi confirmé par le serveur.")));
    if (invite.status === "pending") row.appendChild(btn("Annuler", "btn btn--sm btn--danger", () => { if (window.confirm("Annuler cette invitation ? Cette action sera vérifiée par le serveur.")) mutate(() => API.cancelInvitation(invite.id), "Annulation confirmée par le serveur."); }));
    list.appendChild(row);
  }
  host.appendChild(list);
}

function shopsView(host) {
  if (!state.shops.length) { host.appendChild(msg("Aucune boutique accompagnée n’a été renvoyée par le serveur.", "empty")); return; }
  const list = el("ul", "", "influencer-list");
  for (const shop of state.shops) {
    const row = el("li", "", "influencer-row"), main = el("div", "", "influencer-row__main");
    main.append(el("strong", shop.name), status(shop.statusLabel));
    main.appendChild(el("span", `Lancement : ${dateLabel(shop.launchedAt)} · Produits : ${shop.productCount == null ? "—" : shop.productCount}`, "t-small"));
    if (shop.activity) main.appendChild(el("span", shop.activity, "t-small"));
    main.appendChild(el("span", `Délégation : ${shop.delegationActive == null ? "indisponible" : shop.delegationActive ? "active" : "révoquée"}`, "t-small"));
    row.appendChild(main); list.appendChild(row);
  }
  host.appendChild(list);
}

function renderPartner() {
  const host = document.getElementById("view"); if (!host) return;
  const page = el("div", "", "page influencer-page");
  page.appendChild(head("ESPACE PARTENAIRE", "Données réelles du programme partenaire. Aucun chiffre n’est calculé dans le navigateur."));
  if (state.error) page.appendChild(msg(state.error, "error"));
  if (state.notice) page.appendChild(msg(state.notice, "success"));
  if (state.loading) page.appendChild(msg("Chargement des informations confirmées par le serveur…"));

  const d = state.dashboard;
  if (d) {
    const metrics = el("div", "", "stats influencer-stats");
    metrics.append(metric("Invitations envoyées", d.counts.invitationsSent), metric("Invitations acceptées", d.counts.invitationsAccepted), metric("Boutiques en préparation", d.counts.shopsPreparing), metric("Boutiques approuvées", d.counts.shopsApproved), metric("Boutiques suspendues", d.counts.shopsSuspended), metric("Ventes éligibles", d.counts.eligibleSales));
    page.appendChild(metrics);
    if (d.programStatus !== "active") page.appendChild(msg("Votre statut partenaire actif n’est pas confirmé par le serveur. L’envoi reste indisponible.", "info"));
  } else if (!state.loading && !state.error) page.appendChild(msg("Les données du tableau de bord ne sont pas disponibles.", "info"));

  const inviteCard = card("Inviter un commerçant", "Le lien est géré par le backend. Sa validité est indiquée par les données réelles renvoyées.");
  const form = el("form", "", "influencer-form"), label = el("label", "Adresse email du commerçant"), input = el("input");
  label.htmlFor = "influencerInviteEmail"; input.id = "influencerInviteEmail"; input.type = "email"; input.required = true; input.maxLength = 254; input.autocomplete = "email"; input.placeholder = "nom@exemple.ht";
  const charter = el("label", "", "check"); const accepted = el("input"); accepted.type = "checkbox"; accepted.disabled = !(d && d.programStatus === "active" && d.charterAccepted === true && d.charterVersion); charter.append(accepted, el("span", d?.charterAccepted === true ? `Charte acceptée : ${d.charterVersion || "version serveur"}` : "Acceptation obligatoire de la charte, confirmée par le serveur avant le premier envoi."));
  const send = el("button", "Envoyer l’invitation", "btn btn--pri"); send.type = "submit"; send.disabled = accepted.disabled;
  form.append(label, input, charter, send);
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); if (!accepted.checked) return;
    send.disabled = true; send.textContent = "Envoi en cours…";
    try { const result = await API.sendInvitation(input.value); if (result?.ok !== true) throw new Error("Envoi non confirmé."); state.notice = "L’envoi de l’invitation a été confirmé par le serveur."; state.error = ""; await refreshPartner(); } catch (error) { showError(error); renderPartner(); } finally { send.disabled = !(d && d.programStatus === "active" && d.charterAccepted === true); }
  });
  inviteCard.b.appendChild(form); inviteCard.b.appendChild(msg("Les fonctions d’envoi ne sont pas vérifiées tant que Supabase ne les a pas installées. Le formulaire ne confirme rien sans réponse backend.", "info")); page.appendChild(inviteCard.s);

  const invitationCard = card("Liste des invitations"); invitationsView(invitationCard.b); page.appendChild(invitationCard.s);
  const shopCard = card("Boutiques accompagnées", "La confidentialité de chaque boutique dépend du statut réel renvoyé par le serveur."); shopsView(shopCard.b); page.appendChild(shopCard.s);

  const commissionCard = card("Commissions", "Les données doivent venir uniquement du portefeuille et des fonctions financières existants."); commissionCard.b.appendChild(msg("Commissions en attente, disponibles et ventes éligibles : données non installées ou non vérifiées. Aucun montant n’est calculé ici.", "info")); page.appendChild(commissionCard.s);
  host.replaceChildren(page);
}

async function verifyInvitation() {
  if (!state.token) return;
  state.loading = true; state.error = ""; renderInvitation();
  try { state.session = await session(); state.invitation = await API.verifyInvitation(state.token); } catch (error) { showError(error); } finally { state.loading = false; renderInvitation(); }
}

function renderInvitation() {
  const host = document.getElementById("view"); if (!host) return;
  const page = el("div", "", "page influencer-page"); page.append(head("Invitation d’un commerçant", "Votre compte, votre boutique et votre mot de passe restent sous votre identité."));
  if (state.loading) page.appendChild(msg("Vérification du lien auprès du serveur…"));
  if (state.error) page.appendChild(msg(state.error, "error"));
  if (state.notice) page.appendChild(msg(state.notice, "success"));

  const intro = card("Réception sécurisée", "Le backend vérifie le lien, l’adresse email, l’identité Auth et la charte.");
  intro.b.appendChild(el("p", "Si vous possédez déjà un compte, connectez-vous avec ce compte. Aucun deuxième compte Auth ne sera créé.", "influencer-callout"));
  intro.b.appendChild(btn("Se connecter avec mon compte VAlex", "btn btn--pri", () => { location.hash = "#/compte"; })); page.appendChild(intro.s);

  if (state.invitation) {
    const verify = card("Lien vérifié", "Aucune réussite de création n’est affichée sans confirmation Supabase.");
    const invitation = state.invitation;
    verify.b.appendChild(status(invitation.status_label || (invitation.valid ? "Lien vérifié" : "Lien invalide ou expiré")));
    if (invitation.expires_at) verify.b.appendChild(el("p", `Valable jusqu’au ${dateLabel(invitation.expires_at)}.`, "t-small"));
    if (!state.session) verify.b.appendChild(msg("Connexion requise avec le compte correspondant à l’invitation confirmée.", "info"));
    else if (invitation.valid === true && state.session.confirmed) {
      const charter = card("Accepter la charte de délégation", "Vous gardez la propriété de votre boutique. L’influenceur agit seulement dans les limites autorisées.");
      const steps = el("ol", "", "influencer-steps"); ["Le marchand reste propriétaire du compte et de la boutique.", "L’influenceur ne doit jamais détourner les paiements.", "Les fausses commandes et fausses boutiques sont interdites.", "La révocation doit prendre effet immédiatement; la relation commerciale reste distincte."].forEach((text) => steps.appendChild(el("li", text)));
      charter.b.appendChild(steps);
      const label = el("label", "", "check"), check = el("input"); check.type = "checkbox"; label.append(check, el("span", `J’accepte la charte version ${invitation.charter_version || "non fournie"}.`)); charter.b.appendChild(label);
      const accept = btn("Accepter l’invitation", "btn btn--pri", async () => {
        if (!check.checked || !invitation.charter_version) return; accept.disabled = true;
        try { const result = await API.acceptInvitation(state.token, { charterVersion: invitation.charter_version, charterAccepted: true }); if (result?.ok !== true) throw new Error("Acceptation non confirmée."); state.notice = "L’acceptation a été enregistrée par le serveur pour votre compte existant."; state.token = null; state.invitation = null; renderInvitation(); } catch (error) { showError(error); renderInvitation(); }
      }); accept.disabled = !invitation.charter_version; charter.b.appendChild(accept); verify.b.appendChild(charter.s);
    }
    page.appendChild(verify.s);
  } else if (!state.loading) page.appendChild(msg("Ouvrez un lien d’invitation reçu par email. Aucun lien valide ou expiré n’est simulé dans cette interface.", "info"));

  const launch = card("Préparation de la boutique", "Étapes devant être confirmées dans les parcours serveur existants.");
  const steps = el("ol", "", "influencer-steps"); ["Informations de la boutique", "Livraison et moyens de paiement", "Véritable produit ajouté", "Droits de l’influenceur vérifiés", "Soumission à la validation administrative"].forEach((text) => steps.appendChild(el("li", text)));
  launch.b.appendChild(steps); launch.b.appendChild(msg("Le backend de création/lancement n’est pas installé. Aucun avancement ni validation n’est déclaré.", "info")); page.appendChild(launch.s);
  host.replaceChildren(page);
}

async function refreshPartner() {
  state.loading = true; state.error = ""; renderPartner();
  try { state.session = await session(); const [d, i, s] = await Promise.all([API.loadDashboard(), API.loadInvitations(), API.loadAccompaniedShops()]); state.dashboard = d; state.invitations = i; state.shops = s; } catch (error) { showError(error); } finally { state.loading = false; renderPartner(); }
}

async function loadBadgeSettings(host) {
  const c = card("Badge public facultatif", "Le marchand choisit sa visibilité. Le nom public doit être validé par le backend.");
  try {
    const delegations = await API.loadMerchantDelegations();
    if (!Array.isArray(delegations) || !delegations.length) c.b.appendChild(msg("Aucune délégation réelle disponible.", "empty"));
    for (const row of delegations || []) {
      const line = el("div", "", "influencer-row"), toggle = el("input"), name = row.shop_name || row.name || "Boutique";
      toggle.type = "checkbox"; toggle.checked = row.public_badge_visible === true; toggle.disabled = typeof row.public_badge_visible !== "boolean";
      toggle.addEventListener("change", async () => { toggle.disabled = true; try { await API.setPublicBadge(row.shop_id || row.id, toggle.checked); state.notice = "Choix du badge confirmé par le serveur."; } catch (error) { toggle.checked = !toggle.checked; showError(error); } finally { toggle.disabled = false; } });
      const label = el("label", "", "check"); label.append(toggle, el("span", `Afficher « Boutique lancée avec [nom validé] » — ${name}`)); line.appendChild(label); c.b.appendChild(line);
    }
  } catch (error) { c.b.appendChild(msg(error?.userMessage || "Le réglage du badge n’est pas disponible côté serveur.", "info")); }
  host.appendChild(c.s);
}

function navLink() {
  const nav = document.querySelector(".nav"); if (!nav || document.getElementById("valexInfluencerNav")) return;
  const a = el("a", "ESPACE PARTENAIRE", "item"); a.id = "valexInfluencerNav"; a.href = PARTNER_ROUTE;
  const foot = nav.querySelector(".nav__foot") || nav; foot.appendChild(a);
}

async function mount() {
  navLink();
  const route = parseRoute();
  if (route === PARTNER_ROUTE) await refreshPartner();
  if (route === INVITE_ROUTE) {
    state.session = await session();
    if (state.token) await verifyInvitation(); else renderInvitation();
  }
}

window.addEventListener("hashchange", () => {
  const route = parseRoute();
  if (route === PARTNER_ROUTE) refreshPartner();
  else if (route === INVITE_ROUTE) { if (state.token) verifyInvitation(); else { session().then((value) => { state.session = value; renderInvitation(); }); } }
});

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true }); else mount();
