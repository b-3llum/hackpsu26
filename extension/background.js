importScripts("lib/summarize.js");
const MAX_TEXT = 60000;
const DEFAULTS = { autoCapture: true, freqHours: 24, aiKey: "", aiBase: "https://api.openai.com/v1", aiModel: "gpt-4o-mini" };

const getSettings = async () => ({ ...DEFAULTS, ...(await chrome.storage.local.get("settings")).settings });
const getReceipts = async () => (await chrome.storage.local.get("receipts")).receipts || [];
const saveReceipts = r => chrome.storage.local.set({ receipts: r });

async function sha256(s) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }

async function fetchPolicy(url) {
  const res = await fetch(url, { credentials: "omit", cache: "no-store" });
  const text = CR.htmlToText(await res.text()).slice(0, MAX_TEXT);
  return { url, text, hash: await sha256(text), fetchedAt: Date.now() };
}

async function aiSummary(text, s) {
  if (!s.aiKey) return null;
  try {
    const r = await fetch(s.aiBase.replace(/\/$/, "") + "/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.aiKey },
      body: JSON.stringify({ model: s.aiModel, temperature: 0, response_format: { type: "json_object" }, messages: [
        { role: "system", content: 'Summarize this privacy policy / terms for a regular person. Reply ONLY with JSON: {"risk":"Low|Medium|High","reasons":["..."],"bullets":["You agreed to: ..."]}. Max 10 bullets, plain words, no dashes.' },
        { role: "user", content: text.slice(0, 24000) }] })
    });
    const j = JSON.parse((await r.json()).choices[0].message.content);
    if (!["Low", "Medium", "High"].includes(j.risk) || !Array.isArray(j.bullets)) return null;
    return { source: "ai", risk: j.risk, reasons: (j.reasons || []).slice(0, 3), bullets: j.bullets.slice(0, 10), items: [] };
  } catch (e) { return null; }
}

async function summarize(text) { const s = await getSettings(); return (await aiSummary(text, s)) || CR.summarizeRules(text); }

async function handleCapture(p) {
  const s = await getSettings(); if (!s.autoCapture) return;
  const urls = [...new Set(Object.values(p.links || {}).flat())].slice(0, 4);
  const policies = [];
  for (const u of urls) { try { const pol = await fetchPolicy(u); pol.type = Object.keys(p.links).find(k => p.links[k].includes(u)); policies.push(pol); } catch (e) { policies.push({ url: u, error: String(e) }); } }
  const combined = [p.bannerText, ...policies.map(x => x.text || "")].join(" ");
  const receipts = await getReceipts();
  receipts.unshift({ id: crypto.randomUUID(), ...p, policies, summary: await summarize(combined), changes: [], unread: false });
  await saveReceipts(receipts.slice(0, 500));
}

async function checkAll(manual) {
  const receipts = await getReceipts(); let changed = 0;
  for (const r of receipts) {
    let any = false;
    for (const pol of r.policies) {
      if (!pol.url) continue;
      try {
        const now = await fetchPolicy(pol.url);
        if (pol.hash && now.hash !== pol.hash) {
          const diff = CR.diffSentences(pol.text, now.text);
          r.changes.unshift({ ts: Date.now(), url: pol.url, ...diff, oldHash: pol.hash, newHash: now.hash });
          Object.assign(pol, { text: now.text, hash: now.hash, fetchedAt: now.fetchedAt, error: undefined });
          any = true;
        } else Object.assign(pol, now, { type: pol.type });
      } catch (e) { pol.error = String(e); }
    }
    if (any) {
      const old = r.summary.risk;
      r.summary = await summarize([r.bannerText, ...r.policies.map(x => x.text || "")].join(" "));
      r.changes[0].riskBefore = old; r.changes[0].riskAfter = r.summary.risk;
      r.unread = true; changed++;
      chrome.notifications.create("cr-" + r.id + Date.now(), { type: "basic", iconUrl: "icons/icon128.png", title: "Terms changed on " + r.domain, message: `${r.changes[0].added.length} new sentences. Risk: ${r.changes[0].riskBefore} to ${r.summary.risk}.` });
    }
  }
  await saveReceipts(receipts); await updateBadge();
  return { checked: receipts.length, changed };
}

async function updateBadge() {
  const n = (await getReceipts()).filter(r => r.unread).length;
  chrome.action.setBadgeText({ text: n ? String(n) : "" }); chrome.action.setBadgeBackgroundColor({ color: "#d93025" });
}

async function schedule() { const s = await getSettings(); chrome.alarms.create("check", { periodInMinutes: Math.max(1, s.freqHours * 60) }); }
chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);
chrome.alarms.onAlarm.addListener(a => a.name === "check" && checkAll(false));

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  (async () => {
    if (m.type === "capture") { await handleCapture(m.payload); return { ok: true }; }
    if (m.type === "checkNow") return checkAll(true);
    if (m.type === "markRead") { const r = await getReceipts(); r.forEach(x => { if (!m.id || x.id === m.id) x.unread = false; }); await saveReceipts(r); await updateBadge(); return {}; }
    if (m.type === "delete") { await saveReceipts((await getReceipts()).filter(x => x.id !== m.id)); await updateBadge(); return {}; }
    if (m.type === "reschedule") { await schedule(); return {}; }
    if (m.type === "clearAll") { await chrome.storage.local.remove("receipts"); await updateBadge(); return {}; }
    if (m.type === "simulateV2") {
      const r = await getReceipts(); let n = 0;
      r.forEach(x => x.policies.forEach(p => { if (/terms-v1\.html/.test(p.url)) { p.url = p.url.replace("terms-v1.html", "terms-v2.html"); n++; } }));
      await saveReceipts(r); const res = await checkAll(true); return { pointed: n, ...res };
    }
    if (m.type === "simulateStale") {
      const r = await getReceipts(); if (!r[0]) return { error: "No receipts yet" };
      r[0].policies.forEach(p => { if (p.text) { p.text = p.text.split(". ").slice(0, -3).join(". ") + ". We used to never sell your data."; p.hash = "stale"; } });
      await saveReceipts(r); return checkAll(true);
    }
  })().then(reply);
  return true;
});
