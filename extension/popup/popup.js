import { FINANCE_CATEGORIES } from "../lib/finance/detect.js";
import { suggestActions } from "../lib/actions/actions.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const send = (m) => chrome.runtime.sendMessage(m);
const fmt = (t) => new Date(t).toLocaleString();
const RISK = { low: "Low", medium: "Medium", high: "High" };
const riskLabel = (r) => RISK[String(r).toLowerCase()] || "Low";
const FINANCE = new Set(FINANCE_CATEGORIES);

// One row per point, with every sentence that backs it.
function groupClaims(claims) {
  const groups = new Map();
  for (const c of claims) {
    const g = groups.get(c.text) || { ...c, sources: [], ai: false };
    if (!g.sources.includes(c.sourceSentence)) g.sources.push(c.sourceSentence);
    g.ai ||= c.source === "ai";
    groups.set(c.text, g);
  }
  return [...groups.values()];
}

function claimItem(g) {
  const tags = `${FINANCE.has(g.category) ? '<span class="tag fin">money</span>' : ""}${g.ai ? '<span class="tag ai">AI</span>' : ""}${g.sources.length > 1 ? `<span class="tag">${g.sources.length} sources</span>` : ""}`;
  return `<li class="claim"><details><summary>${esc(g.text)}${tags}</summary>${g.sources.map((s) => `<div class="src">"${esc(s)}"</div>`).join("")}</details></li>`;
}

function actionItem(a) {
  const link = a.link ? ` <a href="${esc(a.link)}" target="_blank" rel="noopener">Open policy</a>` : "";
  const copy = a.draft ? `<button class="copy" data-draft="${esc(a.draft)}">Copy draft</button>` : "";
  return `<li class="claim"><details><summary>${esc(a.title)}</summary><div class="tiny">${esc(a.why)}</div>${a.sourceSentence ? `<div class="src">"${esc(a.sourceSentence)}"</div>` : ""}${a.draft ? `<pre class="draft">${esc(a.draft)}</pre>` : ""}<div class="btns">${copy}${link}</div></details></li>`;
}

function trustLine(s) {
  if (s.engine !== "ai") return '<div class="trust">Rule based: every point is quoted from the policy.</div>';
  return `<div class="trust">AI summary, trust ${Math.round((s.trust ?? 0) * 100)}%: claims without a real source sentence were removed. Tap a point to see its source.</div>`;
}

function card(r) {
  const s = r.summary || {};
  const risk = riskLabel(s.risk);
  const claims = groupClaims(s.claims || []).map(claimItem).join("") || "<li>Nothing notable detected</li>";
  const actions = suggestActions(r).map(actionItem).join("");
  const links = (r.policies || []).map((p) => `<li><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.type || "policy")}: ${esc(p.url)}</a>${p.error ? ' <span class="tiny">(could not fetch)</span>' : ""}</li>`).join("") || "<li>No policy links found on the page</li>";
  const cats = (r.categories || []).map((c) => `<li>${c.on ? "✅" : "⬜"} ${esc(c.name)}</li>`).join("");
  const changes = (r.changes || []).map((c) => `<div><b>${fmt(c.ts)}</b> <span class="tiny">risk ${esc(riskLabel(c.riskBefore))} to ${esc(riskLabel(c.riskAfter))}</span><ul>${(c.added || []).slice(0, 6).map((x) => `<li class="added">+ ${esc(x)}</li>`).join("")}${(c.removed || []).slice(0, 4).map((x) => `<li class="removed">${esc(x)}</li>`).join("")}</ul></div>`).join("") || '<div class="tiny">No changes detected yet</div>';
  return `<div class="receipt" data-id="${esc(r.id)}"><div class="row"><div><div class="site">${esc(r.domain)}${r.unread ? '<span class="new">TERMS CHANGED</span>' : ""}</div><div class="date">${fmt(r.ts)} · clicked "${esc(r.buttonText)}"</div></div><span class="badge ${risk}">${risk}</span></div>
  <div class="details"><h3>What you agreed to</h3>${trustLine(s)}<ul class="claims">${claims}</ul>
  ${actions ? `<h3>What to do next</h3><ul class="claims">${actions}</ul>` : ""}
  ${cats ? `<h3>Cookie categories</h3><ul>${cats}</ul>` : ""}<h3>Policies</h3><ul>${links}</ul><h3>Change history</h3>${changes}
  <div class="btns" style="margin-top:8px"><button class="danger del">Delete receipt</button></div></div></div>`;
}

async function render() {
  const { receipts = [] } = await chrome.storage.local.get("receipts");
  $("#list").innerHTML = receipts.length ? receipts.map(card).join("") : '<div class="empty">No receipts yet.<br>Click "Agree" or "Accept" on any site and a receipt appears here.</div>';
}

$("#list").addEventListener("click", async (e) => {
  const c = e.target.closest(".receipt");
  if (!c) return;
  if (e.target.classList.contains("copy")) {
    await navigator.clipboard.writeText(e.target.dataset.draft);
    e.target.textContent = "Copied";
    return;
  }
  if (e.target.classList.contains("del")) {
    if (confirm("Delete this receipt?")) { await send({ type: "delete", id: c.dataset.id }); render(); }
    return;
  }
  if (e.target.closest(".row")) { c.classList.toggle("open"); send({ type: "markRead", id: c.dataset.id }); }
});

$("#check").onclick = async () => {
  $("#status").textContent = "Checking policies...";
  const r = await send({ type: "checkNow" });
  $("#status").textContent = r.error ? `Check failed: ${r.error}` : `Checked ${r.checked} receipts, ${r.changed} changed.`;
  render();
};
$("#opts").onclick = () => chrome.runtime.openOptionsPage();

function download(name, data, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
}
$("#json").onclick = async () => {
  const { receipts = [] } = await chrome.storage.local.get("receipts");
  download("consent-receipts.json", JSON.stringify(receipts, null, 2), "application/json");
};
$("#html").onclick = async () => {
  const { receipts = [] } = await chrome.storage.local.get("receipts");
  const css = await (await fetch("style.css")).text();
  const body = receipts.map((r) => card(r).replace('class="receipt"', 'class="receipt open"').replaceAll("<details>", "<details open>")).join("");
  download("consent-receipts.html", `<!doctype html><meta charset="utf-8"><title>Consent Receipts</title><style>${css} body{max-width:720px;margin:auto}.btns{display:none}</style><h1 style="padding:14px">Consent Receipts</h1>${body}`, "text/html");
};

render();
