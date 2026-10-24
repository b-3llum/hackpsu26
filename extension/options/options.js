import { DEFAULTS, getSettings } from "../lib/settings.js";

const ids = Object.keys(DEFAULTS);
const $ = (id) => document.getElementById(id);
const CHECKBOXES = new Set(["autoCapture", "financeMode"]);
const msg = (t) => { $("msg").textContent = t; setTimeout(() => { $("msg").textContent = ""; }, 4000); };
const send = (m) => chrome.runtime.sendMessage(m);

getSettings().then((s) => ids.forEach((k) => { if (CHECKBOXES.has(k)) $(k).checked = s[k]; else $(k).value = s[k]; }));

$("save").onclick = async () => {
  const s = {};
  ids.forEach((k) => { s[k] = CHECKBOXES.has(k) ? $(k).checked : k === "freqHours" ? Number($(k).value) : $(k).value.trim(); });
  if (!s.geminiModel) s.geminiModel = DEFAULTS.geminiModel;
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
