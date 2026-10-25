import { api, setBusy } from "./common.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let config = { extensionIds: [], billing: false };
let extensionId = null; // whichever installed build answered (developer or Chrome Web Store)

function notice(kind, text) {
  $("notice").className = `alert alert-${kind}`;
  $("notice").textContent = text;
  $("notice").hidden = !text;
}

const fmtDate = (ms) => new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

function render(user) {
  $("who").textContent = `${user.name} · ${user.email}`;
  const pro = user.plan === "pro";
  $("plan-badge").textContent = config.freePro ? "Pro, free" : pro ? "Pro" : "Free";
  $("plan-badge").className = `badge ${pro ? "badge-pro" : "badge-free"}`;
  $("plan-freepro").hidden = !config.freePro;
  $("plan-free").hidden = pro || config.freePro;
  $("plan-pro").hidden = !pro || config.freePro;
  $("upgrade").hidden = !config.billing;
  $("billing-off").hidden = config.billing;
  if (pro) {
    const cancelling = user.cancelAtPeriodEnd;
    $("pro-status").textContent = cancelling ? "Cancelled, active until the end of the period" : user.status === "trialing" ? "Trial" : "Active";
    $("period-label").textContent = cancelling ? "Ends" : "Renews";
    $("pro-period").textContent = user.currentPeriodEnd ? fmtDate(user.currentPeriodEnd) : "Not available yet";
  }
  $("main").hidden = false;
}

async function load() {
  const [{ data: cfg }, me] = await Promise.all([api("/api/config"), api("/api/me")]);
  config = cfg;
  if (me.status === 401) { location.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); return null; }
  render(me.data.user);
  return me.data.user;
}

// After Stripe Checkout, the webhook can land a moment after the redirect: poll until Pro shows up.
async function waitForPro() {
  notice("info", "Payment received. Turning on Pro...");
  for (let i = 0; i < 20; i++) {
    const { data } = await api("/api/me");
    if (data.user?.plan === "pro") { render(data.user); notice("ok", "You are on Pro. Connect the extension below to use AI summaries."); return; }
    await new Promise((r) => setTimeout(r, 1500));
  }
  notice("info", "Payment received. Pro can take a minute to turn on; reload this page shortly.");
}

function extensionAvailable() {
  return Boolean(extensionId && window.chrome?.runtime?.sendMessage);
}

function ask(id, message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(id, message, (reply) => resolve(chrome.runtime.lastError ? null : reply));
    } catch { resolve(null); }
  });
}

// Find the installed build: the first ID that answers a status message.
async function findExtension() {
  if (!window.chrome?.runtime?.sendMessage) return null;
  for (const id of config.extensionIds || []) {
    if (await ask(id, { type: "status" })) return id;
  }
  return null;
}

const sendToExtension = (message) => ask(extensionId, message);

async function refreshExtensionBadge(user) {
  if (!extensionAvailable()) return;
  const reply = await sendToExtension({ type: "status" });
  const connected = reply && reply.email === user.email;
  $("ext-badge").textContent = connected ? "Connected" : "Not connected";
  $("ext-badge").className = `badge ${connected ? "badge-ok" : "badge-free"}`;
  $("connect").textContent = connected ? "Reconnect" : "Connect the extension";
}

async function connect(user) {
  if (!extensionAvailable()) { $("no-ext").hidden = false; return; }
  setBusy($("connect"), true, "Connecting...");
  const { ok, data } = await api("/api/extension/token", {});
  const reply = ok ? await sendToExtension({ type: "auth", token: data.token, user: data.user }) : null;
  setBusy($("connect"), false);
  if (reply?.ok) {
    notice("ok", data.user.plan === "pro" ? "Extension connected. AI summaries are on." : "Extension connected. Upgrade to Pro to turn on AI summaries.");
    await refreshExtensionBadge(user);
  } else {
    $("no-ext").hidden = false;
    notice("error", "The extension did not answer. Make sure it is installed and enabled, then try again.");
  }
}

const user = await load();
if (user) {
  extensionId = await findExtension();
  await refreshExtensionBadge(user);
  if (params.get("checkout") === "success") waitForPro();
  if (params.get("checkout") === "cancel") notice("info", "Checkout cancelled. You are still on Free.");
  if (params.get("connect") === "1") connect(user);

  $("connect").addEventListener("click", () => connect(user));
  $("upgrade").addEventListener("click", async () => {
    setBusy($("upgrade"), true, "Opening checkout...");
    const { ok, data } = await api("/api/billing/checkout", {});
    if (ok && data.url) { location.assign(data.url); return; }
    setBusy($("upgrade"), false);
    notice("error", data.error || "Could not start checkout.");
  });
  $("portal").addEventListener("click", async () => {
    setBusy($("portal"), true, "Opening billing...");
    const { ok, data } = await api("/api/billing/portal", {});
    if (ok && data.url) { location.assign(data.url); return; }
    setBusy($("portal"), false);
    notice("error", data.error || "Could not open billing.");
  });
}

$("logout").addEventListener("click", async () => {
  await api("/api/logout", {});
  location.assign("/");
});
