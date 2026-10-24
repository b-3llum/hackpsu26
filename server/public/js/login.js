import { api, setupPasswordToggles, setBusy, safeNext } from "./common.js";

const form = document.getElementById("login-form");
const submit = document.getElementById("submit");
const formError = document.getElementById("form-error");
const fromExtension = new URLSearchParams(location.search).get("ext") === "1";
setupPasswordToggles();
document.getElementById("signup-link").search = location.search;
if (fromExtension) document.getElementById("lede").textContent = "Log in to connect the Consent Receipts extension.";

const destination = () => (fromExtension ? "/account?connect=1" : safeNext());

// Already logged in: skip the form.
api("/api/me").then(({ ok }) => { if (ok) location.replace(destination()); });

const ready = () => form.elements.email.value.trim() && form.elements.password.value;
form.addEventListener("input", () => { submit.disabled = !ready(); });

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!ready()) return;
  formError.hidden = true;
  setBusy(submit, true, "Logging in...");
  const { ok, data } = await api("/api/login", {
    email: form.elements.email.value.trim(),
    password: form.elements.password.value,
  }).catch(() => ({ ok: false, data: { error: "Network error. Check your connection and try again." } }));
  if (ok) { location.assign(destination()); return; }
  setBusy(submit, false);
  submit.disabled = !ready();
  formError.textContent = data.error || "Something went wrong. Try again.";
  formError.hidden = false;
  form.elements.password.select();
});
