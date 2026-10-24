// Public terms change tracker. Reads GET /api/changes:
// { events: [{ host, url, ts, riskBefore, riskAfter, added, removed }], byHost: [{ host, changes90d, lastChange }] }
// Everything from the API is rendered with textContent, never innerHTML.
import { api } from "./common.js";

const RISK_ORDER = { low: 1, medium: 2, high: 3 };
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function riskLabel(risk) {
  const r = String(risk || "").toLowerCase();
  return RISK_ORDER[r] ? r[0].toUpperCase() + r.slice(1) : "Unknown";
}

// "up", "down", or "same", comparing risk levels.
export function riskDirection(before, after) {
  const b = RISK_ORDER[String(before || "").toLowerCase()];
  const a = RISK_ORDER[String(after || "").toLowerCase()];
  if (!a || !b || a === b) return "same";
  return a > b ? "up" : "down";
}

function safeHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin + u.pathname : null;
  } catch { return null; }
}

function formatDate(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function plural(n, word) { return `${n} ${word}${n === 1 ? "" : "s"}`; }

function renderEvent(ev) {
  const li = el("li", "changes-item");
  const top = el("div", "row spread");
  const name = el("strong", "", ev.host || "Unknown site");
  const dir = riskDirection(ev.riskBefore, ev.riskAfter);
  const badgeClass = { up: "badge badge-warn", down: "badge badge-ok", same: "badge badge-free" }[dir];
  const badgeText = dir === "same"
    ? `Risk stayed ${riskLabel(ev.riskAfter)}`
    : `Risk ${dir}: ${riskLabel(ev.riskBefore)} to ${riskLabel(ev.riskAfter)}`;
  top.append(name, el("span", badgeClass, badgeText));
  li.append(top);

  const meta = el("p", "hint");
  const bits = [formatDate(ev.ts)];
  if (Number.isFinite(ev.added)) bits.push(`${plural(ev.added, "line")} added`);
  if (Number.isFinite(ev.removed)) bits.push(`${plural(ev.removed, "line")} removed`);
  meta.textContent = bits.filter(Boolean).join(", ");
  const href = safeHttpUrl(ev.url);
  if (href) {
    meta.append(" ");
    const a = el("a", "", "Read the policy");
    a.href = href;
    a.rel = "noopener noreferrer";
    a.target = "_blank";
    meta.append(a);
  }
  li.append(meta);
  return li;
}

function renderHost(h) {
  const li = el("li", "changes-item row spread");
  li.append(el("strong", "", h.host || "Unknown site"));
  const last = formatDate(h.lastChange);
  li.append(el("span", "hint", `Changed ${plural(Number(h.changes90d) || 0, "time")} in 90 days${last ? `, last on ${last}` : ""}`));
  return li;
}

async function main() {
  const status = document.getElementById("status");
  const { ok, status: code, data } = await api("/api/changes");
  if (!ok) {
    status.className = "alert alert-info";
    status.textContent = code === 404 || code === 503
      ? "The change tracker is not turned on yet. Check back soon."
      : "We could not load recent changes. Try again in a minute.";
    return;
  }
  status.hidden = true;

  const cutoff = Date.now() - WEEK_MS;
  const events = (Array.isArray(data.events) ? data.events : [])
    .filter((e) => new Date(e.ts).getTime() >= cutoff)
    .sort((a, b) => new Date(b.ts) - new Date(a.ts));
  const list = document.getElementById("events");
  events.forEach((e) => list.append(renderEvent(e)));
  document.getElementById("events-empty").hidden = events.length > 0;
  document.getElementById("week").hidden = false;

  const hosts = (Array.isArray(data.byHost) ? data.byHost : [])
    .filter((h) => Number(h.changes90d) > 0)
    .sort((a, b) => b.changes90d - a.changes90d)
    .slice(0, 20);
  if (hosts.length) {
    const hl = document.getElementById("by-host");
    hosts.forEach((h) => hl.append(renderHost(h)));
    document.getElementById("hosts").hidden = false;
  }
}

if (typeof document !== "undefined") main();
