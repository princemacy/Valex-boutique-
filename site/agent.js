// VAlex - « Contacter un agent » : accueil IA puis transfert humain.
//
// Regles tenues par ce module :
//   - aucune statistique ni promesse inventee ;
//   - l'IA ne modifie jamais un compte, un paiement, un solde ou un retrait ;
//   - un humain n'est engage qu'apres creation reelle d'une demande ;
//   - la transcription est transmise avec l'accord explicite de la personne ;
//   - les pieces jointes passent par le bucket prive `support-attachments`.
//
// Le module ne contient aucun secret. Il s'appuie sur `window.sb` (cle
// publishable) et sur `window.VAlexSupport` charge par /support.js.

const MAX_MESSAGES = 60;
const POLL_MS = 20000;
const STORE_KEY = "valex_agent_chat_v1";

const ICON = {
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12l16-8-6 16-3-6z"/></svg>',
  clip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 12l6-6a3 3 0 014 4l-8 8a5 5 0 01-7-7l7-7"/></svg>',
  human: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></svg>',
};

const state = {
  open: false,
  busy: false,
  user: null,
  messages: [],
  ticketId: null,
  ticket: null,
  escalated: false,
  language: "fr",
  poll: null,
  greeted: false,
  lastRendered: 0,
};

function $(sel) {
  return document.querySelector(sel);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function icon(name) {
  const span = document.createElement("span");
  span.className = "agentico";
  span.innerHTML = ICON[name] || ICON.chat;
  return span;
}

function loadStored() {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved && Array.isArray(saved.messages)) {
      state.messages = saved.messages
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .slice(-MAX_MESSAGES)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
    }
    if (saved && typeof saved.ticketId === "string") state.ticketId = saved.ticketId;
    if (saved && saved.escalated === true) state.escalated = true;
    if (saved && typeof saved.language === "string") state.language = saved.language === "ht" ? "ht" : "fr";
  } catch (_) {
    /* stockage indisponible : la conversation reste en memoire */
  }
}

function store() {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify({
      messages: state.messages.slice(-MAX_MESSAGES),
      ticketId: state.ticketId,
      escalated: state.escalated,
      language: state.language || "fr",
    }));
  } catch (_) {
    /* sans stockage, rien ne casse */
  }
}

function addMessage(role, content, extra = {}) {
  const text = String(content ?? "").trim();
  if (!text) return null;
  const message = { role, content: text.slice(0, 4000), ...extra };
  state.messages.push(message);
  if (state.messages.length > MAX_MESSAGES) state.messages = state.messages.slice(-MAX_MESSAGES);
  store();
  renderMessages();
  return message;
}

function scrollLog() {
  const log = $("#agentLog");
  if (log) log.scrollTop = log.scrollHeight;
}

function renderMessages() {
  const log = $("#agentLog");
  if (!log) return;
  log.textContent = "";
  for (const m of state.messages) {
    const row = el("div", "agentmsg" + (m.role === "user" ? " me" : "") + (m.system ? " sys" : ""));
    const bubble = el("div", "agentmsg__b");
    const body = el("span", "agentmsg__t", m.content);
    bubble.appendChild(body);
    if (m.attachment) {
      const link = el("a", "agentmsg__a", "Pièce jointe");
      link.href = m.attachmentUrl || "#";
      link.target = "_blank";
      link.rel = "noopener";
      bubble.appendChild(link);
    }
    row.appendChild(bubble);
    if (m.role === "assistant" && !m.system) {
      const tag = el("span", "agentmsg__tag", m.canned ? "Base d'aide VAlex" : "Assistant IA");
      row.appendChild(tag);
    }
    log.appendChild(row);
  }
  scrollLog();
}

function renderTicket() {
  const box = $("#agentTicket");
  if (!box) return;
  const t = state.ticket;
  if (!t) {
    box.hidden = true;
    box.textContent = "";
    return;
  }
  box.hidden = false;
  box.textContent = "";
  const title = el("strong", null, t.subject || "Demande d'assistance");
  const meta = el("span", null,
    `${t.statusLabel} · priorité ${t.priorityLabel} · ${t.language === "ht" ? "kreyòl" : "français"}`);
  box.appendChild(title);
  box.appendChild(meta);
  const link = el("a", "agent__link", "Ouvrir le suivi");
  link.href = "#/assistance/" + t.id;
  link.addEventListener("click", () => closePanel());
  box.appendChild(link);
}

function humanLabel() {
  return state.language === "ht" ? "Pale ak yon moun" : "Parler à un humain";
}

function updateHumanButton() {
  const b = $("#agentHuman");
  if (b) b.textContent = humanLabel();
}

function setBusy(value) {
  state.busy = Boolean(value);
  const send = $("#agentSend");
  const input = $("#agentInput");
  const attach = $("#agentAttach");
  if (send) send.disabled = state.busy;
  if (input) input.disabled = state.busy;
  if (attach) attach.disabled = state.busy || !state.ticketId;
  const typing = $("#agentTyping");
  if (typing) typing.hidden = !state.busy;
}

function setPanel(open) {
  state.open = open;
  const shell = $("#agentShell");
  const btn = $("#agentBtn");
  if (!shell) return;
  shell.hidden = !open;
  document.body.classList.toggle("agentopen", open);
  if (btn) btn.hidden = open;
  if (open) {
    if (!state.greeted) {
      state.greeted = true;
      if (!state.messages.length) {
        addMessage("assistant",
          "Bonjou. Bonjour. Je suis l'assistant VAlex. Je réponds sur les commandes, la livraison, le paiement, le parrainage et la gratuité des boutiques. Je ne peux pas modifier un compte, un solde, un paiement ou un remboursement. Écrivez « Parler à un humain » ou « Pale ak yon moun » pour un agent.",
          { canned: true });
      }
    }
    renderMessages();
    renderTicket();
    updateHumanButton();
    setBusy(false);
    setTimeout(() => {
      const input = $("#agentInput");
      if (input && !input.disabled) input.focus({ preventScroll: true });
    }, 60);
  } else {
    stopPoll();
  }
}

function closePanel() {
  setPanel(false);
}

function shellMarkup() {
  const shell = el("div", "agent");
  shell.id = "agentShell";
  shell.hidden = true;
  shell.innerHTML = `
    <div class="agent__bg" data-agent-close></div>
    <section class="agent__panel" role="dialog" aria-modal="true" aria-labelledby="agentTitle">
      <header class="agent__head">
        <span class="agent__avatar">${ICON.chat}</span>
        <span class="agent__id"><strong id="agentTitle">Contacter un agent</strong><span>Assistant IA puis humain sur demande</span></span>
        <button class="agent__x" type="button" data-agent-close aria-label="Fermer">${ICON.close}</button>
      </header>
      <div class="agent__ticket" id="agentTicket" hidden></div>
      <div class="agent__log" id="agentLog" role="log" aria-live="polite" aria-relevant="additions"></div>
      <div class="agent__typing" id="agentTyping" hidden><span class="spin"></span> L'assistant lit votre message…</div>
      <div class="agent__quick" id="agentQuick">
        <button type="button" data-q="Comment suivre ma commande ?">Suivre ma commande</button>
        <button type="button" data-q="Comment se passe la livraison et le paiement ?">Livraison et paiement</button>
        <button type="button" data-q="Les boutiques sont-elles gratuites ?">Gratuité des boutiques</button>
        <button type="button" class="agent__human" id="agentHuman" data-human="1">Parler à un humain</button>
      </div>
      <form class="agent__form" id="agentForm" autocomplete="off">
        <textarea id="agentInput" rows="1" maxlength="2000" placeholder="Écrivez votre message…" aria-label="Votre message"></textarea>
        <input type="file" id="agentFile" accept=".jpg,.jpeg,.png,.webp,.pdf,.txt" hidden>
        <button type="button" class="agent__clip" id="agentAttach" aria-label="Joindre un fichier (5 Mo maximum)" disabled>${ICON.clip}</button>
        <button type="submit" class="agent__send" id="agentSend" aria-label="Envoyer">${ICON.send}</button>
      </form>
      <p class="agent__note" id="agentNote">L'assistant IA ne remplace pas un agent. Aucun paiement, remboursement ou changement de compte n'est effectué ici. Pièces jointes : jpg, png, webp, pdf ou txt, 5 Mo maximum.</p>
      <div class="agent__login" id="agentLogin" hidden><a href="#/compte" data-agent-close>Se connecter ou créer un compte</a></div>
    </section>`;
  return shell;
}

function buttonMarkup() {
  const btn = el("button", "agentbtn");
  btn.id = "agentBtn";
  btn.type = "button";
  btn.setAttribute("aria-label", "Contacter un agent");
  btn.innerHTML = `${ICON.chat}<span>Contacter un agent</span>`;
  return btn;
}

const FAQ = {
  order: "Pour suivre une commande : Compte > Mes commandes. Le vendeur a 24 h pour accepter. Le code de réception est donné uniquement quand l'article est entre vos mains. Si le colis n'arrive pas, ouvrez « Problème » sur la commande.",
  delivery: "Le paiement se fait directement au vendeur : espèces à la livraison, MonCash ou NatCash. VAlex ne détient pas l'argent des ventes. La livraison et ses frais sont fixés par le vendeur et affichés avant la commande. Quand VAlex livre, 20 % des frais de livraison rémunèrent le service de livraison.",
  free: "Toutes les boutiques éligibles sont gratuites jusqu'au 31 décembre 2026 inclus, calculé en heure d'Haïti. Après cette date, aucun prélèvement et aucune suspension automatiques : les conditions seront annoncées à l'avance. Aucune commission n'est prélevée sur les ventes.",
  reviews: "Les notes et avis sont fermés. Les données historiques restent conservées, mais aucune nouvelle note ne peut être soumise et aucune note n'est affichée sur le site.",
  referral: "Le parrainage est un registre comptable de 2 %. Il n'y a ni solde disponible, ni retrait, ni portefeuille client. Un gain éventuel est traité manuellement par la comptabilité.",
  payment: "Le paiement en ligne n'est pas ouvert. Utilisez le paiement direct au vendeur. Aucun débit automatique n'est activé.",
  account: "Pour un compte : utilisez l'adresse email exacte de l'inscription, puis « Mot de passe oublié ». Ne partagez jamais votre mot de passe ni un code de vérification.",
};

function faqKey(text) {
  const t = String(text || "").toLowerCase();
  if (/(commande|commann|colis|suivi|recevwa|order)/.test(t)) return "order";
  if (/(livr|peman|moncash|natcash|payer|peye|frais)/.test(t)) return "delivery";
  if (/(gratui|gratis|gratuit|abonnement|pri|free)/.test(t)) return "free";
  if (/(avis|avi|note|rating|kòmantè|komante)/.test(t)) return "reviews";
  if (/(parrain|referral|ambassad|2\s*%)/.test(t)) return "referral";
  if (/(paiement en ligne|online|kat|kob|remboursement|refund)/.test(t)) return "payment";
  if (/(compte|kont|email|imèl|imeil|mot de passe|modpas|connexion)/.test(t)) return "account";
  return null;
}

function categoryFor(text) {
  const t = String(text || "").toLowerCase();
  if (/(paiement|peman|moncash|natcash|remboursement|refund|kòb|kob)/.test(t)) return "payment";
  if (/(livr|livrezon|colis|delivery)/.test(t)) return "delivery";
  if (/(commande|komann|kòmand|commann|order|achat)/.test(t)) return "order";
  if (/(publicité|publicite|annonce|ad\b)/.test(t)) return "ad";
  if (/(compte|kont|email|imèl|connexion|mot de passe|modpas)/.test(t)) return "account";
  return "other";
}

function priorityFor(text) {
  const t = String(text || "").toLowerCase();
  if (/(arnaque|fraude|menace|vòl|vol|urgence|ijans|urgent)/.test(t)) return "urgent";
  const cat = categoryFor(text);
  return cat === "payment" || cat === "order" || cat === "delivery" ? "high" : "normal";
}

function subjectFor(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length >= 3) return clean.slice(0, 120);
  return "Demande d'assistance";
}

function transcriptForServer() {
  return state.messages
    .filter((m) => !m.system)
    .slice(-60)
    .map((m) => ({ role: m.role, content: String(m.content || "").slice(0, 4000) }))
    .filter((m) => m.content);
}

function transcriptText() {
  return state.messages
    .filter((m) => !m.system)
    .map((m) => `${m.role === "user" ? "Client" : "Assistant"} : ${m.content}`)
    .join("\n")
    .slice(0, 1900);
}

async function currentUser() {
  if (state.user) return state.user;
  if (!window.sb) return null;
  try {
    const { data } = await window.sb.auth.getUser();
    state.user = data && data.user ? data.user : null;
  } catch (_) {
    state.user = null;
  }
  return state.user;
}

async function module() {
  for (let i = 0; i < 30; i += 1) {
    if (window.VAlexSupport) return window.VAlexSupport;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return window.VAlexSupport || null;
}

async function callAI(question) {
  if (!window.sb) throw new Error("client_indisponible");
  const history = state.messages
    .filter((m) => !m.system)
    .slice(-10)
    .map((m) => ({ role: m.role, content: String(m.content || "").slice(0, 900) }));
  const { data, error } = await window.sb.functions.invoke("valex-ai", {
    body: {
      task: "support",
      question: String(question || "").slice(0, 1200),
      history,
      language: state.language || "fr",
      page: String(location.hash || "#/").slice(0, 160),
    },
  });
  if (error) {
    let message = "L'assistant est momentanément indisponible.";
    try {
      const body = await error.context.json();
      if (body && body.error) message = body.error;
    } catch (_) {
      /* message generique */
    }
    throw new Error(message);
  }
  if (data && data.error) throw new Error(data.error);
  return data || {};
}

async function ensureTicket(firstText) {
  const MP = await module();
  if (!MP) throw new Error("assistance_indisponible");
  if (state.ticketId) return state.ticketId;
  const ticketId = await MP.openTicket({
    subject: subjectFor(firstText),
    category: categoryFor(firstText),
    body: String(firstText || "").slice(0, 1900),
  });
  state.ticketId = ticketId;
  store();
  const view = await MP.loadTicket(ticketId, (state.user || {}).id || null);
  state.ticket = view.ticket;
  renderTicket();
  const attach = $("#agentAttach");
  if (attach) attach.disabled = false;
  return ticketId;
}

async function escalate(firstText) {
  if (state.busy) return;
  const user = await currentUser();
  if (!user) {
    addMessage("assistant",
      "Pour transmettre la conversation à un agent humain, connectez-vous ou créez un compte gratuit. Votre conversation reste affichée ici pendant la connexion. Utilisez « Créer un compte » dans Compte, puis revenez sur ce bouton.",
      { canned: true });
    const link = $("#agentLogin");
    if (link) link.hidden = false;
    return;
  }
  setBusy(true);
  try {
    const MP = await module();
    if (!MP) throw new Error("assistance_indisponible");
    const ticketId = await ensureTicket(firstText);
    const transcript = transcriptForServer();
    let escalated = false;
    try {
      await MP.escalateToHuman(ticketId, {
        transcript,
        language: state.language || "fr",
        priority: priorityFor(firstText),
      });
      escalated = true;
    } catch (err) {
      if (!err || !err.missing) throw err;
      // Le serveur n'a pas encore la fonction p59 : la demande existe deja
      // dans la file standard. On y ajoute la transcription, sans inventer
      // de priorite ni de statut.
      const text = transcriptText();
      if (text) {
        await MP.reply(ticketId, "Transcription de la conversation avec l'assistant :\n" + text);
      }
    }
    const view = await MP.loadTicket(ticketId, user.id);
    state.ticket = view.ticket;
    state.escalated = true;
    store();
    renderTicket();
    addMessage("assistant",
      escalated
        ? "Votre conversation est transmise à un agent humain. La demande est dans la file, avec sa priorité. Vous pouvez continuer à écrire ici : vos messages arrivent sur la même demande."
        : "Votre demande est enregistrée dans la file d'assistance standard, avec la transcription de notre échange. Un agent humain la prendra en charge. La priorisation automatique sera active après la prochaine mise à jour du serveur.",
      { system: true, canned: true });
    startPoll();
    updateHumanButton();
  } catch (err) {
    addMessage("assistant",
      "Le transfert n'a pas abouti : " + String((err && err.message) || "erreur inconnue") + ". Rien n'a été inventé. Réessayez dans un instant ou ouvrez Assistance depuis Compte.",
      { system: true, canned: true });
  } finally {
    setBusy(false);
  }
}

async function send(text) {
  const value = String(text || "").trim();
  if (!value || state.busy) return;
  if (window.VAlexSupport && window.VAlexSupport.detectLanguage) {
    state.language = window.VAlexSupport.detectLanguage(value);
  } else {
    state.language = /[àÿ]|mwen|ou|pale|moun|kijan|poukisa|bonjou|mèsi|mesi|kòb|kob|livrezon|komann/i.test(value) ? "ht" : "fr";
  }
  updateHumanButton();
  addMessage("user", value);
  const input = $("#agentInput");
  if (input) input.value = "";
  setBusy(true);

  if (window.VAlexSupport && window.VAlexSupport.isHumanRequest && window.VAlexSupport.isHumanRequest(value)) {
    setBusy(false);
    await escalate(value);
    return;
  }

  const user = await currentUser();
  if (!user) {
    const key = faqKey(value);
    addMessage("assistant",
      (key ? FAQ[key] + "\n\n" : "") +
      "Pour une réponse personnalisée, connectez-vous gratuitement : l'assistant IA et le transfert vers un humain protègent le service contre les abus. Vous pouvez aussi utiliser « Parler à un humain » après connexion.",
      { canned: true });
    setBusy(false);
    return;
  }

  if (state.ticketId && state.escalated) {
    try {
      const MP = await module();
      await MP.reply(state.ticketId, value);
      addMessage("assistant", "Message ajouté à votre demande. Un agent le verra dans la file.", { system: true, canned: true });
    } catch (err) {
      addMessage("assistant", "Le message n'a pas pu être ajouté : " + String((err && err.message) || "erreur") + ".", { system: true, canned: true });
    } finally {
      setBusy(false);
    }
    return;
  }

  try {
    const data = await callAI(value);
    const answer = String(data.answer || "").trim();
    addMessage("assistant", answer || "Je n'ai pas de réponse certaine à cette question. Un agent humain peut vérifier avec vous.",
      { canned: false });
    if (data.suggest_human) {
      addMessage("assistant", "Si vous voulez, utilisez « Parler à un humain » : la conversation sera transmise avec votre accord.", { system: true, canned: true });
    }
  } catch (err) {
    const key = faqKey(value);
    addMessage("assistant",
      (key ? FAQ[key] + "\n\n" : "") +
      "L'assistant IA est indisponible pour le moment. Cette réponse vient de la base d'aide VAlex, pas d'une IA. Pour une vérification, utilisez « Parler à un humain ».",
      { canned: true });
  } finally {
    setBusy(false);
  }
}

async function attachFile(file) {
  if (!file) return;
  if (!state.ticketId) {
    addMessage("assistant", "Pour envoyer une pièce jointe, commencez par « Parler à un humain » afin d'ouvrir une demande. Les fichiers ne sont acceptés que dans une demande suivie.",
      { system: true, canned: true });
    return;
  }
  const user = await currentUser();
  if (!user) {
    addMessage("assistant", "Connectez-vous pour envoyer une pièce jointe.", { system: true, canned: true });
    return;
  }
  setBusy(true);
  try {
    const MP = await module();
    const path = await MP.uploadAttachment(state.ticketId, file);
    await MP.reply(state.ticketId, "Pièce jointe envoyée : " + file.name, path);
    const url = await MP.signedAttachmentUrl(path);
    addMessage("assistant", "Pièce jointe reçue : " + file.name, { system: true, canned: true, attachment: path, attachmentUrl: url });
  } catch (err) {
    addMessage("assistant", "La pièce jointe a été refusée : " + String((err && err.message) || "format ou taille non autorisé") + ". Formats acceptés : jpg, png, webp, pdf, txt, 5 Mo maximum.",
      { system: true, canned: true });
  } finally {
    setBusy(false);
    const input = $("#agentFile");
    if (input) input.value = "";
  }
}

function stopPoll() {
  if (state.poll) {
    clearInterval(state.poll);
    state.poll = null;
  }
}

function startPoll() {
  stopPoll();
  if (!state.ticketId) return;
  state.poll = setInterval(async () => {
    if (!state.open || !state.ticketId) return;
    try {
      const MP = await module();
      if (!MP) return;
      const view = await MP.loadTicket(state.ticketId, (state.user || {}).id || null);
      state.ticket = view.ticket;
      renderTicket();
      const known = new Set(state.messages.filter((m) => m.id).map((m) => m.id));
      for (const m of view.messages) {
        if (m.internal || m.mine || known.has(m.id)) continue;
        if (m.authorKind === "user") continue;
        const exists = state.messages.some((x) => x.id === m.id);
        if (exists) continue;
        let url = null;
        if (m.attachment) url = await MP.signedAttachmentUrl(m.attachment);
        addMessage("assistant", m.body, {
          id: m.id,
          canned: m.authorKind !== "ai",
          attachment: m.attachment || null,
          attachmentUrl: url,
        });
      }
    } catch (_) {
      /* silence : la prochaine lecture reessaiera */
    }
  }, POLL_MS);
}

function wire() {
  const btn = $("#agentBtn");
  const shell = $("#agentShell");
  if (!btn || !shell || btn.dataset.wired) return;
  btn.dataset.wired = "1";

  btn.addEventListener("click", () => setPanel(true));
  shell.querySelectorAll("[data-agent-close]").forEach((node) => node.addEventListener("click", closePanel));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.open) closePanel();
  });

  const form = $("#agentForm");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $("#agentInput");
    send(input ? input.value : "");
  });

  const input = $("#agentInput");
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 110) + "px";
  });

  shell.querySelectorAll("[data-q]").forEach((chip) => {
    chip.addEventListener("click", () => send(chip.dataset.q || ""));
  });
  const human = $("#agentHuman");
  if (human) human.addEventListener("click", () => escalate("Demande de transfert vers un agent humain."));

  const attach = $("#agentAttach");
  const file = $("#agentFile");
  if (attach && file) {
    attach.addEventListener("click", () => file.click());
    file.addEventListener("change", () => attachFile(file.files && file.files[0]));
  }

  document.addEventListener("click", (event) => {
    if (!state.open) return;
    const target = event.target;
    if (target && target.closest && target.closest("#agentBtn")) return;
    if (target && target.closest && target.closest("#agentShell")) return;
  });
}

function mount() {
  if (document.getElementById("agentBtn")) return;
  const btn = buttonMarkup();
  const shell = shellMarkup();
  document.body.appendChild(btn);
  document.body.appendChild(shell);
  loadStored();
  renderMessages();
  renderTicket();
  updateHumanButton();
  wire();
  if (state.ticketId) startPoll();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}
