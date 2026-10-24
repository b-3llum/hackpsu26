// The signed in account (from the website's Connect button) and Pro summaries through our server.
// The extension never holds the Gemini key; the server checks the plan on every call.
import { SITE } from "./settings.js";

export const MAX_SERVER_TEXT = 60000;

export async function getAccount() {
  return (await chrome.storage.local.get("account")).account || null;
}
export const setAccount = (account) => chrome.storage.local.set({ account });
export const clearAccount = () => chrome.storage.local.remove("account");

async function call(path, { token, body, fetchImpl = fetch } = {}) {
  return fetchImpl(`${SITE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Pro summary from the server, or null (signed out, Free plan, offline, or an error). */
export async function serverSummary(text, mode, { fetchImpl } = {}) {
  const account = await getAccount();
  if (!account?.token) return null;
  const res = await call("/api/summarize", { token: account.token, body: { text: text.slice(0, MAX_SERVER_TEXT), mode }, fetchImpl });
  if (res.status === 401) { await clearAccount(); return null; }
  if (res.status === 402) { if (account.plan !== "free") await setAccount({ ...account, plan: "free" }); return null; }
  if (!res.ok) return null;
  const { summary } = await res.json();
  if (account.plan !== "pro") await setAccount({ ...account, plan: "pro" });
  return summary;
}

/** Re-read the plan and email from the server (after an upgrade or cancel on the website). */
export async function refreshAccount({ fetchImpl } = {}) {
  const account = await getAccount();
  if (!account?.token) return null;
  const res = await call("/api/extension/me", { token: account.token, fetchImpl });
  if (res.status === 401) { await clearAccount(); return null; }
  if (!res.ok) return account;
  const { user } = await res.json();
  const next = { ...account, email: user.email, name: user.name, plan: user.plan };
  await setAccount(next);
  return next;
}

export async function signOut({ fetchImpl } = {}) {
  const account = await getAccount();
  if (account?.token) await call("/api/extension/logout", { token: account.token, body: {}, fetchImpl }).catch(() => {});
  await clearAccount();
}
