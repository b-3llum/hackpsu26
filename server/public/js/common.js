// Shared helpers for the auth and account pages. No inline scripts: the CSP only allows 'self'.
export async function api(path, body, method = body === undefined ? "GET" : "POST") {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  return { ok: res.ok, status: res.status, data };
}

const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';

// Show/Hide toggles on password inputs.
export function setupPasswordToggles(root = document) {
  root.querySelectorAll("[data-toggle-pass]").forEach((btn) => {
    const input = document.getElementById(btn.dataset.togglePass);
    btn.innerHTML = `${EYE}<span>Show</span>`;
    btn.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.querySelector("span").textContent = show ? "Hide" : "Show";
      btn.setAttribute("aria-pressed", String(show));
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  });
}

// Field level errors from the API ({ fields: { email: "..." } }).
export function showFieldErrors(form, fields = {}) {
  form.querySelectorAll(".field-error").forEach((e) => { e.hidden = true; e.textContent = ""; });
  form.querySelectorAll("[aria-invalid]").forEach((e) => e.removeAttribute("aria-invalid"));
  for (const [name, msg] of Object.entries(fields)) {
    const err = form.querySelector(`[data-error-for="${name}"]`);
    const input = form.elements[name];
    if (err) { err.textContent = msg; err.hidden = false; }
    if (input && input.setAttribute) input.setAttribute("aria-invalid", "true");
  }
}

export function setBusy(button, busy, busyText) {
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}

// Only same site paths are allowed as a post login destination.
export function safeNext(defaultPath = "/account") {
  const next = new URLSearchParams(location.search).get("next") || "";
  return /^\/(?!\/)[\w\-/?=&.]*$/.test(next) ? next : defaultPath;
}

// "Continue with Google" (Auth0) shows only when the server has it configured. Keeps ?next= and ?ext=1.
export async function setupGoogle({ showTerms = false } = {}) {
  const block = document.getElementById("google-block");
  if (!block) return;
  const { data } = await api("/api/config").catch(() => ({ data: {} }));
  if (!data.google) return;
  const params = new URLSearchParams(location.search);
  const q = new URLSearchParams();
  if (params.get("ext") === "1") q.set("ext", "1");
  if (params.get("next")) q.set("next", params.get("next"));
  document.getElementById("google").href = `/auth/google${q.toString() ? `?${q}` : ""}`;
  document.getElementById("google-terms").hidden = !showTerms;
  block.hidden = false;
}

// Errors passed back in the URL (from the Google callback).
export function urlError() {
  const e = new URLSearchParams(location.search).get("error");
  return e === "google" ? "Google sign in did not finish. Try again, or use your email and password."
    : e === "unverified" ? "Your Google account email is not verified, so we could not sign you in with it."
    : "";
}

// Is the Consent Receipts extension installed in this browser? Chrome only exposes chrome.runtime to our pages
// when an installed extension lists this site in externally_connectable, so this also works as a cheap check.
export function askExtension(id, message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(id, message, (reply) => resolve(chrome.runtime.lastError ? null : reply));
    } catch { resolve(null); }
  });
}

/** Returns the ID of the installed build that answers (developer or Chrome Web Store), or null. */
export async function findExtension(ids = []) {
  if (!window.chrome?.runtime?.sendMessage) return null;
  for (const id of ids) {
    if (await askExtension(id, { type: "status" })) return id;
  }
  return null;
}

/** Chrome, Edge, Brave, and other Chromium browsers can load the extension. */
export const isChromium = () => Boolean(window.chrome) || /Chrome\//.test(navigator.userAgent);
