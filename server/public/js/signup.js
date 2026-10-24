import { api, setupPasswordToggles, showFieldErrors, setBusy, safeNext } from "./common.js";

const form = document.getElementById("signup-form");
const submit = document.getElementById("submit");
const formError = document.getElementById("form-error");
setupPasswordToggles();

// Keep ?next= (and ?ext=1 from the extension) when switching to the log in page.
document.getElementById("login-link").search = location.search;

// The button stays disabled until every field could pass; the server still checks everything.
function ready() {
  const f = form.elements;
  return f.name.value.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim())
    && f.password.value.length >= 12 && f.password.value.length <= 128 && f.acceptTerms.checked;
}
form.addEventListener("input", () => { submit.disabled = !ready(); });
form.addEventListener("change", () => { submit.disabled = !ready(); });

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!ready()) return;
  formError.hidden = true;
  setBusy(submit, true, "Creating account...");
  const f = form.elements;
  const { ok, data } = await api("/api/signup", {
    name: f.name.value.trim(),
    email: f.email.value.trim(),
    password: f.password.value,
    acceptTerms: f.acceptTerms.checked,
  }).catch(() => ({ ok: false, data: { error: "Network error. Check your connection and try again." } }));
  if (ok) {
    location.assign(new URLSearchParams(location.search).get("ext") === "1" ? "/account?connect=1" : safeNext());
    return;
  }
  setBusy(submit, false);
  submit.disabled = !ready();
  formError.textContent = data.error || "Something went wrong. Try again.";
  formError.hidden = false;
  showFieldErrors(form, data.fields);
});
