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
