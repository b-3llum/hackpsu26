import { summarize } from "./lib/summary/summarize.js";
import { geminiLlm } from "./lib/gemini.js";
import { htmlToText, sha256, diffSentences } from "./lib/policy.js";
import { getSettings } from "./lib/settings.js";

const MAX_TEXT = 60000;
const MAX_RECEIPTS = 500;

const getReceipts = async () => (await chrome.storage.local.get("receipts")).receipts || [];
const saveReceipts = (r) => chrome.storage.local.set({ receipts: r });

async function fetchPolicy(url) {
  const res = await fetch(url, { credentials: "omit", cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = htmlToText(await res.text()).slice(0, MAX_TEXT);
  return { url, text, hash: await sha256(text), fetchedAt: Date.now() };
}

// One fetch per URL per run, even when many receipts share a policy.
function policyFetcher() {
  const cache = new Map();
  return (url) => {
    if (!cache.has(url)) cache.set(url, fetchPolicy(url));
    return cache.get(url);
  };
}

const receiptText = (r) => [r.bannerText, ...r.policies.map((p) => p.text || "")].filter(Boolean).join("\n");

// Rules only unless `ai` is set, so receipts and alerts never wait on the network.
async function summarizeReceipt(r, { ai = false } = {}) {
  const s = await getSettings();
  const llm = ai ? geminiLlm({ apiKey: s.geminiKey, model: s.geminiModel }) : null;
  return summarize(receiptText(r), { mode: s.financeMode ? "finance" : "general", llm });
}

// Replace the instant rules summary with the Gemini one once it arrives. The popup re-renders on the storage change.
async function upgradeWithAi(ids, changeTs) {
  const s = await getSettings();
  if (!s.geminiKey) return;
  for (const id of ids) {
    const current = (await getReceipts()).find((x) => x.id === id);
    if (!current) continue;
    const summary = await summarizeReceipt(current, { ai: true });
    if (summary.engine !== "ai") continue;
    const receipts = await getReceipts();
    const r = receipts.find((x) => x.id === id);
    if (!r) continue;
    r.summary = summary;
    if (changeTs && r.changes[0]?.ts === changeTs) r.changes[0].riskAfter = summary.risk;
    await saveReceipts(receipts);
  }
}

async function handleCapture(p) {
  const s = await getSettings();
  if (!s.autoCapture) return;
  const get = policyFetcher();
  const urls = [...new Set(Object.values(p.links || {}).flat())].slice(0, 4);
  const policies = [];
  for (const url of urls) {
    const type = Object.keys(p.links).find((k) => p.links[k].includes(url));
    try {
      policies.push({ ...(await get(url)), type });
    } catch (e) {
      policies.push({ url, type, error: String(e) });
    }
  }
  const receipt = { id: crypto.randomUUID(), ...p, policies, changes: [], unread: false };
  receipt.summary = await summarizeReceipt(receipt);
  const receipts = await getReceipts();
  receipts.unshift(receipt);
  await saveReceipts(receipts.slice(0, MAX_RECEIPTS));
  upgradeWithAi([receipt.id]).catch((e) => console.warn("Gemini upgrade failed", e));
}

async function checkAll() {
  const receipts = await getReceipts();
  const get = policyFetcher();
  const changedIds = [];
  const runTs = Date.now();
  let changed = 0;
  for (const r of receipts) {
    let diffs = [];
    for (const pol of r.policies) {
      if (!pol.url) continue;
      try {
        const now = await get(pol.url);
        if (pol.hash && now.hash !== pol.hash) diffs.push({ url: pol.url, ...diffSentences(pol.text, now.text) });
        Object.assign(pol, { text: now.text, hash: now.hash, fetchedAt: now.fetchedAt, error: undefined });
      } catch (e) {
        pol.error = String(e);
      }
    }
    if (!diffs.length) continue;
    const riskBefore = r.summary?.risk;
    r.summary = await summarizeReceipt(r);
    const change = {
      ts: runTs,
      urls: diffs.map((d) => d.url),
      added: diffs.flatMap((d) => d.added),
      removed: diffs.flatMap((d) => d.removed),
      riskBefore,
      riskAfter: r.summary.risk,
    };
    r.changes.unshift(change);
    r.unread = true;
    changed++;
    changedIds.push(r.id);
    chrome.notifications.create(`cr-${r.id}-${change.ts}`, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: `Terms changed on ${r.domain}`,
      message: `${change.added.length} new sentences. Risk: ${riskBefore} to ${change.riskAfter}.`,
    });
  }
  await saveReceipts(receipts);
  await updateBadge();
  upgradeWithAi(changedIds, runTs).catch((e) => console.warn("Gemini upgrade failed", e));
  return { checked: receipts.length, changed };
}

async function resummarizeAll() {
  const receipts = await getReceipts();
  for (const r of receipts) r.summary = await summarizeReceipt(r, { ai: true });
  await saveReceipts(receipts);
  return { updated: receipts.length };
}

async function updateBadge() {
  const n = (await getReceipts()).filter((r) => r.unread).length;
  await chrome.action.setBadgeText({ text: n ? String(n) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#d93025" });
}

async function schedule() {
  const s = await getSettings();
  await chrome.alarms.create("check", { periodInMinutes: Math.max(1, s.freqHours * 60) });
}

chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "check") checkAll(); });

const HANDLERS = {
  capture: (m) => handleCapture(m.payload).then(() => ({ ok: true })),
  checkNow: () => checkAll(),
  resummarize: () => resummarizeAll(),
  reschedule: () => schedule().then(() => ({})),
  async markRead(m) {
    const r = await getReceipts();
    r.forEach((x) => { if (!m.id || x.id === m.id) x.unread = false; });
    await saveReceipts(r);
    await updateBadge();
    return {};
  },
  async delete(m) {
    await saveReceipts((await getReceipts()).filter((x) => x.id !== m.id));
    await updateBadge();
    return {};
  },
  async clearAll() {
    await chrome.storage.local.remove("receipts");
    await updateBadge();
    return {};
  },
  // Demo: repoint saved terms-v1.html links to terms-v2.html, then check.
  async simulateV2() {
    const r = await getReceipts();
    let pointed = 0;
    r.forEach((x) => x.policies.forEach((p) => {
      if (/terms-v1\.html/.test(p.url)) { p.url = p.url.replace("terms-v1.html", "terms-v2.html"); pointed++; }
    }));
    await saveReceipts(r);
    return { pointed, ...(await checkAll()) };
  },
  // Demo: make the newest receipt's snapshot stale so the next check reports a change on any real site.
  async simulateStale() {
    const r = await getReceipts();
    if (!r[0]) return { error: "No receipts yet" };
    r[0].policies.forEach((p) => {
      if (p.text) { p.text = p.text.split("\n").slice(0, -3).join("\n"); p.hash = "stale"; }
    });
    await saveReceipts(r);
    return checkAll();
  },
};

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  const h = HANDLERS[m?.type];
  if (!h || sender.id !== chrome.runtime.id) return false;
  // Content scripts run on every site, so they may only report captures. Extension pages may do anything.
  const fromExtensionPage = (sender.url || "").startsWith(chrome.runtime.getURL(""));
  if (!fromExtensionPage && m.type !== "capture") return false;
  h(m).then(reply, (e) => reply({ error: String(e) }));
  return true;
});
