const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const send = m => chrome.runtime.sendMessage(m);
const fmt = t => new Date(t).toLocaleString();

function card(r) {
  const s = r.summary || {};
  const links = (r.policies || []).map(p => `<li><a href="${esc(p.url)}" target="_blank">${esc(p.type || "policy")}: ${esc(p.url)}</a>${p.error ? ' <span class="tiny">(could not fetch)</span>' : ""}</li>`).join("") || "<li>No policy links found on the page</li>";
  const cats = (r.categories || []).map(c => `<li>${c.on ? "✅" : "⬜"} ${esc(c.name)}</li>`).join("");
  const changes = (r.changes || []).map(c => `<div><b>${fmt(c.ts)}</b> <span class="tiny">risk ${esc(c.riskBefore)} to ${esc(c.riskAfter)}</span><ul>${c.added.slice(0, 6).map(x => `<li class="added">+ ${esc(x)}</li>`).join("")}${c.removed.slice(0, 4).map(x => `<li class="removed">${esc(x)}</li>`).join("")}</ul></div>`).join("") || '<div class="tiny">No changes detected yet</div>';
  return `<div class="receipt" data-id="${r.id}"><div class="row"><div><div class="site">${esc(r.domain)}${r.unread ? '<span class="new">TERMS CHANGED</span>' : ""}</div><div class="date">${fmt(r.ts)} · clicked "${esc(r.buttonText)}"</div></div><span class="badge ${esc(s.risk)}">${esc(s.risk)}</span></div>
  <div class="details"><h3>Plain-words summary (${esc(s.source)})</h3><ul>${(s.bullets || []).map(b => `<li class="${/^Good news/.test(b) ? "good" : ""}">${esc(b)}</li>`).join("") || "<li>Nothing notable detected</li>"}</ul>
  ${s.reasons?.length ? `<h3>Why ${esc(s.risk)} risk</h3><ul>${s.reasons.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
  ${cats ? `<h3>Cookie categories</h3><ul>${cats}</ul>` : ""}<h3>Policies</h3><ul>${links}</ul><h3>Change history</h3>${changes}
  <div class="btns" style="margin-top:8px"><button class="danger del">Delete receipt</button></div></div></div>`;
}

async function render() {
  const { receipts = [] } = await chrome.storage.local.get("receipts");
  $("#list").innerHTML = receipts.length ? receipts.map(card).join("") : '<div class="empty">No receipts yet.<br>Click "Agree" or "Accept" on any site and a receipt appears here.</div>';
}
$("#list").addEventListener("click", async e => {
  const c = e.target.closest(".receipt"); if (!c) return;
  if (e.target.classList.contains("del")) { if (confirm("Delete this receipt?")) { await send({ type: "delete", id: c.dataset.id }); render(); } return; }
  if (e.target.closest(".row")) { c.classList.toggle("open"); send({ type: "markRead", id: c.dataset.id }); }
});
$("#check").onclick = async () => { $("#status").textContent = "Checking policies..."; const r = await send({ type: "checkNow" }); $("#status").textContent = `Checked ${r.checked} receipts, ${r.changed} changed.`; render(); };
$("#opts").onclick = () => chrome.runtime.openOptionsPage();
function download(name, data, type) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; a.click(); }
$("#json").onclick = async () => { const { receipts = [] } = await chrome.storage.local.get("receipts"); download("consent-receipts.json", JSON.stringify(receipts, null, 2), "application/json"); };
$("#html").onclick = async () => {
  const { receipts = [] } = await chrome.storage.local.get("receipts");
  const css = await (await fetch("style.css")).text();
  const body = receipts.map(r => card(r).replace('class="receipt"', 'class="receipt open"')).join("");
  download("consent-receipts.html", `<!doctype html><meta charset="utf-8"><title>Consent Receipts</title><style>${css} body{max-width:720px;margin:auto}.btns{display:none}</style><h1 style="padding:14px">Consent Receipts</h1>${body}`, "text/html");
};
render();
