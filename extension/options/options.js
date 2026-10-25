import { DEFAULTS, getSettings, SITE } from "../lib/settings.js";

const ids = Object.keys(DEFAULTS);
const $ = (id) => document.getElementById(id);
const CHECKBOXES = new Set(["autoCapture", "financeMode"]);
const msg = (t) => { $("msg").textContent = t; setTimeout(() => { $("msg").textContent = ""; }, 4000); };
const send = (m) => chrome.runtime.sendMessage(m);

getSettings().then((s) => ids.forEach((k) => { if (CHECKBOXES.has(k)) $(k).checked = s[k]; else $(k).value = s[k]; }));

$("save").onclick = async () => {
  const s = {};
  ids.forEach((k) => { s[k] = CHECKBOXES.has(k) ? $(k).checked : k === "freqHours" ? Number($(k).value) : $(k).value.trim(); });
  await chrome.storage.local.set({ settings: s });
  await send({ type: "reschedule" });
  msg("Saved");
};
$("resum").onclick = async () => { msg("Summarizing..."); const r = await send({ type: "resummarize" }); msg(r.error || `Updated ${r.updated} receipts`); };
$("v2").onclick = async () => { const r = await send({ type: "simulateV2" }); msg(r.error || `Repointed ${r.pointed} policy links, ${r.changed} receipts changed`); };
$("stale").onclick = async () => { const r = await send({ type: "simulateStale" }); msg(r.error || `${r.changed} receipts changed`); };
$("clear").onclick = async () => {
  if (confirm("Delete all receipts? This cannot be undone.")) { await send({ type: "clearAll" }); msg("All data cleared"); }
};

// Account: sign in happens on the website, which hands the extension a token.
async function renderAccount() {
  const { account } = await send({ type: "account" });
  const actions = $("acct-actions");
  actions.textContent = "";
  const button = (label, onClick, primary) => {
    const b = document.createElement("button");
    b.textContent = label;
    if (primary) b.className = "primary";
    b.onclick = onClick;
    actions.append(b);
  };
  if (!account) {
    $("acct-status").textContent = "Not signed in. Free features work without an account.";
    button("Sign in or create an account", () => chrome.tabs.create({ url: `${SITE}/login?ext=1` }), true);
    return;
  }
  $("acct-status").textContent = `Signed in as ${account.email}. Plan: ${account.plan === "pro" ? "Pro (AI summaries on)" : "Free"}.`;
  if (account.plan !== "pro") button("Upgrade to Pro", () => chrome.tabs.create({ url: `${SITE}/account` }), true);
  else button("Manage account", () => chrome.tabs.create({ url: `${SITE}/account` }));
  button("Sign out", async () => { await send({ type: "signOut" }); renderAccount(); });
}
renderAccount();
chrome.storage.onChanged.addListener((c) => { if (c.account) renderAccount(); });
