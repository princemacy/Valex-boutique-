// VAlex - installation PWA, indicateur hors ligne et garde des mutations.
//
// Une seule inscription du service worker est faite ici. Les autres modules
// (push.js) reutilisent `getRegistration()` au lieu d'inscrire un second SW.
// Le cache ne contient que le shell et les assets statiques : jamais de
// reponse utilisateur, de profil, de commande ou de donnee financiere.

const SW_URL = "/sw.js";
const DISMISS_KEY = "valex_install_later";
const SHOW_DELAY_MS = 2200;

let registrationPromise = null;
let deferredPrompt = null;
let shown = false;
let banner = null;

export function isStandalone() {
  return (
    (typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(display-mode: standalone)").matches) ||
    (typeof navigator !== "undefined" && navigator.standalone === true)
  );
}

export function getRegistration() {
  if (
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator) ||
    !window.isSecureContext
  ) {
    return Promise.resolve(null);
  }
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register(SW_URL, { scope: "/" })
      .then(async (registration) => {
        await navigator.serviceWorker.ready;
        return registration;
      })
      .catch((error) => {
        registrationPromise = null;
        throw error;
      });
  }
  return registrationPromise;
}

function dismissedForSession() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch (_) {
    return false;
  }
}

function dismiss() {
  shown = true;
  try {
    sessionStorage.setItem(DISMISS_KEY, "1");
  } catch (_) {
    // Session storage indisponible : la banniere reste simplement fermee.
  }
  if (banner) {
    banner.remove();
    banner = null;
  }
}

function isIosSafari() {
  const ua = String(navigator.userAgent || "");
  const ios = /iphone|ipad|ipod/i.test(ua);
  const otherBrowser = /crios|fxios|edgios|opios/i.test(ua);
  return ios && !otherBrowser;
}

function buildBanner(kind) {
  const element = document.createElement("div");
  element.className = "installbar";
  element.id = "installBar";
  element.setAttribute("role", "dialog");
  element.setAttribute("aria-label", "Installer VAlex");

  const icon = document.createElement("img");
  icon.className = "installbar__ic";
  icon.src = "/icon-192.png";
  icon.alt = "";
  icon.width = 38;
  icon.height = 38;

  const body = document.createElement("div");
  body.className = "installbar__b";
  const title = document.createElement("strong");
  title.textContent = "Installer VAlex";
  const text = document.createElement("span");
  text.textContent = kind === "ios"
    ? "Touchez Partager, puis « Sur l'écran d'accueil »."
    : "Ajoutez la boutique à votre écran d'accueil.";
  body.append(title, text);

  element.append(icon, body);

  if (kind === "prompt") {
    const install = document.createElement("button");
    install.type = "button";
    install.className = "installbar__go";
    install.textContent = "Installer";
    install.addEventListener("click", async () => {
      if (!deferredPrompt) return dismiss();
      const prompt = deferredPrompt;
      deferredPrompt = null;
      try {
        await prompt.prompt();
        await prompt.userChoice;
      } catch (_) {
        // Refus ou prompt deja consomme : on ferme sans inventer de succes.
      }
      dismiss();
    });
    element.append(install);
  }

  const close = document.createElement("button");
  close.type = "button";
  close.className = "installbar__x";
  close.setAttribute("aria-label", kind === "ios" ? "Compris" : "Plus tard");
  close.textContent = kind === "ios" ? "Compris" : "Plus tard";
  close.addEventListener("click", dismiss);
  element.append(close);
  return element;
}

function showBanner(kind) {
  if (shown || dismissedForSession() || isStandalone() || !document.body) return;
  if (document.getElementById("installBar")) return;
  shown = true;
  banner = buildBanner(kind);
  document.body.appendChild(banner);
}

function scheduleBanner() {
  if (isStandalone() || dismissedForSession()) return;
  setTimeout(() => {
    if (deferredPrompt) showBanner("prompt");
    else if (isIosSafari()) showBanner("ios");
  }, SHOW_DELAY_MS);
}

// --- Hors ligne : bandeau visible et blocage des mutations ---------------
function mountOffline() {
  if (!document.body) return;
  const bar = document.createElement("div");
  bar.id = "offlineBar";
  bar.className = "offlinebar";
  bar.setAttribute("role", "status");
  bar.setAttribute("aria-live", "polite");
  bar.textContent = "Hors ligne";
  bar.hidden = true;
  document.body.appendChild(bar);

  let wasOffline = navigator.onLine === false;
  const sync = () => {
    const offline = navigator.onLine === false;
    bar.hidden = !offline;
    document.documentElement.classList.toggle("offline", offline);
    if (!offline && wasOffline && typeof window.toast === "function") {
      window.toast("Connexion rétablie.");
    }
    wasOffline = offline;
  };
  window.addEventListener("online", sync);
  window.addEventListener("offline", sync);
  sync();

  // Une mutation Supabase (insert, update, rpc, auth) n'est jamais mise en
  // file hors ligne. Les lectures GET echouent naturellement et sont gerees
  // par les ecrans ; on ne bloque que les ecritures.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = function guardedFetch(input, init) {
    let url = "";
    let method = "GET";
    try {
      url = typeof input === "string" ? input : String(input && input.url || "");
      method = String(
        (init && init.method) || (input && input.method) || "GET",
      ).toUpperCase();
    } catch (_) {
      return nativeFetch(input, init);
    }
    const mutating = method !== "GET" && method !== "HEAD";
    if (navigator.onLine === false && mutating && /supabase\.co/i.test(url)) {
      if (typeof window.toast === "function") {
        window.toast("Hors ligne : action non envoyée. Réessayez avec internet.");
      }
      return Promise.reject(new DOMException("Hors ligne", "NetworkError"));
    }
    return nativeFetch(input, init);
  };
}

// --- Cycle de vie --------------------------------------------------------
export function boot() {
  mountOffline();
  scheduleBanner();

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    if (!shown && !dismissedForSession()) {
      setTimeout(() => showBanner("prompt"), 600);
    }
  });

  window.addEventListener("appinstalled", dismiss);

  const hadController = "serviceWorker" in navigator &&
    Boolean(navigator.serviceWorker.controller);
  let refreshing = false;
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }

  getRegistration().catch(() => {
    // Sans service worker, le site reste utilisable : pas de cache offline,
    // pas de message trompeur.
  });
}

const api = { boot, getRegistration, isStandalone };

if (typeof window !== "undefined") {
  window.VAlexPWA = api;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
}

export default api;
