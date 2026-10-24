const D = { autoCapture: true, freqHours: 24, aiKey: "", aiBase: "https://api.openai.com/v1", aiModel: "gpt-4o-mini" };
const ids = Object.keys(D), $ = id => document.getElementById(id), msg = t => { $("msg").textContent = t; setTimeout(() => $("msg").textContent = "", 3000); };
chrome.storage.local.get("settings").then(({ settings }) => { const s = { ...D, ...settings }; ids.forEach(k => k === "autoCapture" ? $(k).checked = s[k] : $(k).value = s[k]); });
$("save").onclick = async () => { const s = {}; ids.forEach(k => s[k] = k === "autoCapture" ? $(k).checked : k === "freqHours" ? Number($(k).value) : $(k).value.trim()); await chrome.storage.local.set({ settings: s }); await chrome.runtime.sendMessage({ type: "reschedule" }); msg("Saved"); };
$("v2").onclick = async () => { const r = await chrome.runtime.sendMessage({ type: "simulateV2" }); msg(`Repointed ${r.pointed} policy links, ${r.changed} receipts changed`); };
$("stale").onclick = async () => { const r = await chrome.runtime.sendMessage({ type: "simulateStale" }); msg(r.error || `${r.changed} receipts changed`); };
$("clear").onclick = async () => { if (confirm("Delete all receipts? This cannot be undone.")) { await chrome.runtime.sendMessage({ type: "clearAll" }); msg("All data cleared"); } };
