// VAlex — interface programme partenaire dans le SPA existant.
// Aucune autorisation locale n'est considérée comme preuve; le serveur reste juge.
import * as API from "./influencer-api.js";
import { OPTIONAL_PERMISSIONS, BASE_CAPABILITIES, normalizeMerchantDelegations } from "./influencer-core.mjs";

const PARTNER_ROUTE = "#/espace-partenaire";
const INVITE_ROUTE = "#/invitation";
const DELEGATIONS_ROUTE = "#/acces-delegues";
const SHOP_DETAIL_RE = /^#\/espace-partenaire\/boutique\/[0-9a-f-]{36}$/i;
const OPTIONAL_LABELS = Object.freeze({ stock_manage: "Gérer les stocks", prices_manage: "Modifier les prix", orders_manage: "Gérer les commandes", delivery_manage: "Modifier les frais de livraison", messages_reply: "Répondre aux messages" });
const BASE_LABELS = Object.freeze({ products_create: "Créer des produits", products_edit: "Modifier des produits", products_publish: "Publier des produits", ai_assist: "Utiliser l’assistance IA", referral_tools: "Utiliser les outils de parrainage personnels" });
const state = { dashboard: null, invitations: [], shops: [], delegations: [], shopPermissions: new Map(), activity: new Map(), loading: false, error: "", notice: "", session: null, token: null, invitation: null };

function el(tag, text = "", cls = "") { const n = document.createElement(tag); if (text !== "") n.textContent = text; if (cls) n.className = cls; return n; }
function btn(text, cls, action) { const n = el("button", text, cls); n.type = "button"; n.addEventListener("click", action); return n; }
function message(text, kind = "info") { const n = el("p", text, `influencer-message influencer-message--${kind}`); n.setAttribute("role", kind === "error" ? "alert" : "status"); return n; }
function card(title, description = "") { const section = el("section", "", "card influencer-card"), header = el("div", "", "card__h"), body = el("div", "", "card__b"); header.appendChild(el("h2", title, "t-h3")); section.append(header, body); if (description) body.appendChild(el("p", description, "t-sub")); return { section, body }; }
function dateLabel(value) { if (!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("fr-FR"); }
function pageHead(title, subtitle) { const h = el("header", "", "phead influencer-head"), t = el("div", "", "phead__t"); t.append(el("h1", title), el("p", subtitle)); h.appendChild(t); return h; }
function status(label) { return el("span", label || "Statut inconnu", "influencer-status"); }
async function currentSession() { const auth = window.sb?.auth; if (!auth?.getUser) return null; const { data, error } = await auth.getUser(); if (error || !data?.user) return null; return { id: data.user.id, email: data.user.email || null, confirmed: Boolean(data.user.email_confirmed_at) }; }
function route() { const hash = String(location.hash || ""); if (hash.startsWith("#/invitation/")) { state.token = hash.slice("#/invitation/".length).split(/[?#]/)[0] || null; history.replaceState(null, "", location.pathname + location.search + INVITE_ROUTE); return INVITE_ROUTE; } if (SHOP_DETAIL_RE.test(hash)) return PARTNER_ROUTE; return [PARTNER_ROUTE, INVITE_ROUTE, DELEGATIONS_ROUTE].includes(hash) ? hash : ""; }
function fail(error) { state.error = error?.userMessage || "Le service partenaire n’est pas disponible. Aucune action n’a été confirmée."; state.notice = ""; }
function setSuccess(result, text) { if (!result || result.ok !== true) throw new Error("Le serveur n’a pas confirmé l’opération."); state.notice = text; state.error = ""; }

function renderInvitations(host) {
  if (!state.invitations.length) { host.appendChild(message("Aucune invitation réelle renvoyée par le serveur.", "empty")); return; }
  const list = el("ul", "", "influencer-list");
  for (const invite of state.invitations) { const row = el("li", "", "influencer-row"), main = el("div", "", "influencer-row__main"); main.append(el("strong", invite.email || "Adresse masquée"), status(invite.statusLabel), el("span", `Créée le ${dateLabel(invite.createdAt)} · expire le ${dateLabel(invite.expiresAt)}`, "t-small")); row.appendChild(main);
    if (["pending", "send_error"].includes(invite.status)) row.appendChild(btn("Renvoyer", "btn btn--sm", () => runMutation(() => API.resendInvitation(invite.id), "Renvoi confirmé par le backend.")));
    if (invite.status === "pending") row.appendChild(btn("Annuler", "btn btn--sm btn--danger", () => { if (window.confirm("Annuler cette invitation ? Le serveur vérifiera les droits et l’état.")) runMutation(() => API.cancelInvitation(invite.id), "Annulation confirmée par le backend."); }));
    list.appendChild(row);
  }
  host.appendChild(list);
}
async function runMutation(action, successText) { state.error = ""; state.notice = ""; try { const result = await action(); setSuccess(result, successText); await refreshPartner(); } catch (error) { fail(error); renderPartner(); } }
function renderPartnerShops(host) {
  if (!state.shops.length) { host.appendChild(message("Aucune boutique accompagnée renvoyée par le serveur.", "empty")); return; }
  const list = el("ul", "", "influencer-list");
  for (const shop of state.shops) { const row = el("li", "", "influencer-row"), main = el("div", "", "influencer-row__main"); main.append(el("strong", shop.name), status(shop.statusLabel), el("span", `Lancement : ${dateLabel(shop.launchedAt)} · Produits : ${shop.productCount == null ? "—" : shop.productCount}`, "t-small")); if (shop.activity) main.appendChild(el("span", shop.activity, "t-small")); row.appendChild(main);
    row.appendChild(btn("Voir mes droits", "btn btn--sm", () => { location.hash = `${PARTNER_ROUTE}/boutique/${encodeURIComponent(shop.id)}`; })); list.appendChild(row);
  }
  host.appendChild(list);
}
function renderGrantedRights(host, shopId) {
  const permissions = state.shopPermissions.get(shopId);
  if (!permissions) { host.appendChild(message("Les droits effectifs sont indisponibles. Aucune opération déléguée ne doit être considérée comme autorisée.", "info")); return; }
  host.appendChild(status(permissions.delegationActive === true ? "Délégation active selon le serveur" : permissions.delegationActive === false ? "Délégation révoquée selon le serveur" : "État de délégation inconnu"));
  host.appendChild(el("p", `Dernière activité : ${dateLabel(permissions.lastActivityAt)}`, "t-small"));
  const list = el("ul", "", "influencer-steps");
  for (const key of BASE_CAPABILITIES) list.appendChild(el("li", `${BASE_LABELS[key]} : ${permissions.base[key] ? "accordé" : "non accordé"}`));
  for (const key of OPTIONAL_PERMISSIONS) list.appendChild(el("li", `${OPTIONAL_LABELS[key]} : ${permissions.optional[key] === true ? "accordé" : permissions.optional[key] === false ? "non accordé" : "indisponible"}`));
  host.appendChild(list);
  host.appendChild(message("Les droits affichés sont informatifs. Chaque opération produit/commande doit être revérifiée par le backend; l’interface ne peut pas accorder ni garantir un accès.", "info"));
  const products = card("Outils de produits", "La gestion doit réutiliser les écrans VAlex existants et être contrôlée côté serveur pour chaque opération.");
  products.body.appendChild(message("Le parcours produit existant et ses contrôles de délégation n’ont pas été vérifiés. Aucun bouton d’édition n’est activé tant que le serveur ne confirme pas l’autorisation effective.", "info"));
  host.appendChild(products.section);
}
function renderPartner() {
  const host = document.getElementById("view"); if (!host) return;
  const detail = String(location.hash || "").match(/^#\/espace-partenaire\/boutique\/([0-9a-f-]{36})$/i);
  const page = el("div", "", "page influencer-page"); page.appendChild(pageHead("ESPACE PARTENAIRE", "Suivi des invitations et boutiques associés à votre session VAlex."));
  if (state.error) page.appendChild(message(state.error, "error")); if (state.notice) page.appendChild(message(state.notice, "success")); if (state.loading) page.appendChild(message("Chargement des informations confirmées par le serveur…"));
  if (detail) { const id = detail[1]; const back = btn("← Retour à l’espace partenaire", "btn btn--sm", () => { location.hash = PARTNER_ROUTE; }); page.appendChild(back); const rights = card("Droits accordés par le marchand"); renderGrantedRights(rights.body, id); page.appendChild(rights.section); }
  else {
    if (state.dashboard) { const d = state.dashboard, stats = el("div", "", "stats influencer-stats"); [["Invitations envoyées",d.counts.invitationsSent],["Invitations acceptées",d.counts.invitationsAccepted],["Boutiques en préparation",d.counts.shopsPreparing],["Boutiques approuvées",d.counts.shopsApproved],["Boutiques suspendues",d.counts.shopsSuspended],["Ventes éligibles",d.counts.eligibleSales]].forEach(([label,value]) => { const m=el("div","","influencer-metric"); m.append(el("strong",value==null?"—":String(value)),el("span",label)); stats.appendChild(m); }); page.appendChild(stats); if (d.programStatus !== "active") page.appendChild(message("Le serveur ne confirme pas un statut partenaire actif; les mutations restent indisponibles.", "info")); }
    const invite = card("Inviter un commerçant", "La réponse d’envoi et l’expiration doivent être confirmées par le backend."); const form=el("form","","influencer-form"), label=el("label","Adresse email du commerçant"), input=el("input"); label.htmlFor="influencerInviteEmail"; Object.assign(input,{id:"influencerInviteEmail",type:"email",required:true,maxLength:254,autocomplete:"email",placeholder:"nom@exemple.ht"}); const checkLabel=el("label","","check"), check=el("input"); check.type="checkbox"; check.disabled=!(state.dashboard?.programStatus==="active"&&state.dashboard?.charterAccepted===true); checkLabel.append(check,el("span",state.dashboard?.charterVersion?`Charte acceptée : ${state.dashboard.charterVersion}`:"Charte/version non confirmée par le backend.")); const submit=el("button","Envoyer l’invitation","btn btn--pri"); submit.type="submit"; submit.disabled=check.disabled; form.append(label,input,checkLabel,submit); form.addEventListener("submit",async e=>{e.preventDefault();if(!check.checked)return;submit.disabled=true;submit.textContent="Envoi en cours…";try{const result=await API.sendInvitation(input.value);setSuccess(result,"Invitation envoyée par le backend.");await refreshPartner();}catch(err){fail(err);renderPartner();}finally{submit.disabled=true;submit.textContent="Envoyer l’invitation";}}); invite.body.append(form,message("Aucune invitation fictive. Si la fonction backend manque, l’envoi échoue sans confirmation.","info")); page.appendChild(invite.section);
    const invites=card("Liste des invitations");renderInvitations(invites.body);page.appendChild(invites.section);
    const shops=card("Boutiques accompagnées");renderPartnerShops(shops.body);page.appendChild(shops.section);
    const commission=card("Commissions", "Aucun nouveau portefeuille ou calcul client.");commission.body.appendChild(message("Commissions non affichées dans cette interface; seuls les systèmes financiers existants peuvent fournir des valeurs.","info"));page.appendChild(commission.section);
  }
  host.replaceChildren(page);
}
function renderDelegationPermissions(host, delegation) {
  const panel=card("Permissions facultatives", "Le propriétaire peut modifier uniquement ces permissions non sensibles. Le serveur doit appliquer le changement avant toute opération ultérieure.");
  const permissions=delegation.permissions || {};
  for(const key of OPTIONAL_PERMISSIONS){const label=el("label","","check influencer-permission"), input=el("input");input.type="checkbox";input.checked=permissions[key]===true;input.disabled=typeof permissions[key]!=="boolean"||delegation.delegationActive!==true;label.append(input,el("span",OPTIONAL_LABELS[key]));input.addEventListener("change",async()=>{input.disabled=true;try{const result=await API.updateShopPermissions(delegation.shopId,{[key]:input.checked});setSuccess(result,"Permission enregistrée par le backend.");await refreshDelegations();}catch(error){fail(error);renderDelegations();}});panel.body.appendChild(label);}
  panel.body.appendChild(message("Paiements, destinations MonCash/NatCash, coordonnées bancaires, portefeuille, retraits, identité, compte propriétaire, rôles administratifs et sécurité ne sont jamais délégables.","info"));host.appendChild(panel.section);
}
function renderDelegations() {
  const host=document.getElementById("view");if(!host)return;const page=el("div","","page influencer-page");page.appendChild(pageHead("ACCÈS DÉLÉGUÉS","Le propriétaire conserve les droits et peut révoquer l’accès."));
  if(state.error)page.appendChild(message(state.error,"error"));if(state.notice)page.appendChild(message(state.notice,"success"));
  if(!state.delegations.length)page.appendChild(message(state.loading?"Chargement des délégations…":"Aucune délégation réelle renvoyée par le serveur.","info"));
  for(const item of state.delegations){const section=card(item.shopName,`Influenceur : ${item.influencerPublicName||"Nom public indisponible"}`),meta=el("div","","influencer-row__main");meta.append(status(item.delegationActive===true?"Accès actif":item.delegationActive===false?"Révoqué":"État inconnu"),el("span",`Dernière activité : ${dateLabel(item.lastActivityAt)}`,"t-small"));section.body.appendChild(meta);
    const base=card("Droits de base accordés");const baseList=el("ul","","influencer-steps");for(const key of BASE_CAPABILITIES)baseList.appendChild(el("li",`${BASE_LABELS[key]} : ${item.basePermissions[key]===true?"accordé":"indisponible"}`));base.body.appendChild(baseList);section.body.appendChild(base.section);
    renderDelegationPermissions(section.body,item);
    const history=card("Historique des activités");const records=state.activity.get(item.shopId);if(!records)history.body.appendChild(btn("Charger l’historique","btn btn--sm",async()=>{try{state.activity.set(item.shopId,await API.loadShopActivity(item.shopId));renderDelegations();}catch(error){fail(error);renderDelegations();}}));else if(!records.length)history.body.appendChild(message("Aucune activité réelle renvoyée par le serveur.","empty"));else{const list=el("ul","","influencer-steps");for(const event of records)list.appendChild(el("li",`${event.label} · ${dateLabel(event.createdAt)}${event.summary?` — ${event.summary}`:""}`));history.body.appendChild(list);}section.body.appendChild(history.section);
    const revoke=btn(item.delegationActive===true?"Révoquer immédiatement l’accès":"Accès non actif","btn btn--danger",async()=>{if(item.delegationActive!==true)return;if(!window.confirm(`Révoquer l’accès de ${item.influencerPublicName||"cet influenceur"} à ${item.shopName} ? Les opérations suivantes doivent être refusées par Supabase. L’historique et l’attribution de parrainage sont conservés.`))return;revoke.disabled=true;try{const result=await API.revokeShopDelegation(item.shopId,true);setSuccess(result,"Révocation confirmée par le serveur.");await refreshDelegations();}catch(error){fail(error);renderDelegations();}});revoke.disabled=item.delegationActive!==true;section.body.appendChild(revoke);page.appendChild(section.section);
  }
  page.appendChild(message("L’interface ne peut pas sécuriser les mutations. Les RPC de mise à jour et de révocation doivent contrôler côté serveur l’identité du propriétaire, la permission et le statut actif à chaque requête.","info"));host.replaceChildren(page);
}
async function refreshDelegations(){state.loading=true;state.error="";renderDelegations();try{state.session=await currentSession();const rows=await API.loadMerchantDelegations();state.delegations=normalizeMerchantDelegations(rows);}catch(error){fail(error);}finally{state.loading=false;renderDelegations();}}
async function refreshPartner(){state.loading=true;state.error="";renderPartner();try{state.session=await currentSession();const [d,i,s]=await Promise.all([API.loadDashboard(),API.loadInvitations(),API.loadAccompaniedShops()]);state.dashboard=d;state.invitations=i;state.shops=s;const pairs=await Promise.all(s.map(async shop=>[shop.id,await API.loadShopPermissions(shop.id).catch(()=>null)]));state.shopPermissions=new Map(pairs.filter(([,p])=>p));}catch(error){fail(error);}finally{state.loading=false;renderPartner();}}
async function verifyInvitation(){if(!state.token)return;state.loading=true;renderInvitation();try{state.session=await currentSession();state.invitation=await API.verifyInvitation(state.token);}catch(error){fail(error);}finally{state.loading=false;renderInvitation();}}
function renderInvitation(){const host=document.getElementById("view");if(!host)return;const page=el("div","","page influencer-page");page.appendChild(pageHead("Invitation d’un commerçant","Votre compte et votre boutique restent sous votre identité."));if(state.error)page.appendChild(message(state.error,"error"));if(state.loading)page.appendChild(message("Vérification auprès du serveur…"));const box=card("Invitation", "L’email confirmé et l’identité Auth sont vérifiés côté serveur.");box.body.appendChild(message("Possédez-vous déjà un compte VAlex ? Connectez-vous avec celui-ci. Aucun compte Auth secondaire ne sera créé.","info"));box.body.appendChild(btn("Se connecter avec mon compte VAlex","btn btn--pri",()=>{location.hash="#/compte";}));if(state.invitation){box.body.appendChild(status(state.invitation.status_label||"État renvoyé par le backend"));if(!state.session)box.body.appendChild(message("Une session Auth existante est requise pour accepter l’invitation.","info"));else if(state.invitation.valid===true&&state.session.confirmed){const check=el("input");check.type="checkbox";const label=el("label","","check");label.append(check,el("span",`J’accepte la charte ${state.invitation.charter_version||"(version indisponible)"}.`));box.body.appendChild(label);const accept=btn("Accepter l’invitation","btn btn--pri",async()=>{if(!check.checked||!state.invitation.charter_version)return;accept.disabled=true;try{const res=await API.acceptInvitation(state.token,{charterVersion:state.invitation.charter_version,charterAccepted:true});setSuccess(res,"Acceptation confirmée par le serveur.");state.token=null;renderInvitation();}catch(error){fail(error);renderInvitation();}});accept.disabled=!state.invitation.charter_version;box.body.appendChild(accept);}}else if(!state.loading)box.body.appendChild(message("Lien non vérifié ou backend indisponible. Aucune boutique ni aucun compte n’a été créé.","info"));page.appendChild(box.section);host.replaceChildren(page);}
function render(){const r=route();if(r===PARTNER_ROUTE)renderPartner();else if(r===DELEGATIONS_ROUTE)renderDelegations();else if(r===INVITE_ROUTE)renderInvitation();}
function addNav(){const nav=document.querySelector(".nav");if(!nav)return;for(const [id,title,href] of [["valexInfluencerNav","ESPACE PARTENAIRE",PARTNER_ROUTE],["valexDelegationsNav","ACCÈS DÉLÉGUÉS",DELEGATIONS_ROUTE]])if(!document.getElementById(id)){const a=el("a",title,"item");a.id=id;a.href=href;(nav.querySelector(".nav__foot")||nav).appendChild(a);}}
async function mount(){addNav();const r=route();if(r===PARTNER_ROUTE)await refreshPartner();else if(r===DELEGATIONS_ROUTE)await refreshDelegations();else if(r===INVITE_ROUTE){if(state.token)await verifyInvitation();else renderInvitation();}}
window.addEventListener("hashchange",()=>{addNav();const r=route();if(r===PARTNER_ROUTE)refreshPartner();else if(r===DELEGATIONS_ROUTE)refreshDelegations();else if(r===INVITE_ROUTE){if(state.token)verifyInvitation();else renderInvitation();}});
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});else mount();
