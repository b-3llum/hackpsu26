import test from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db.js";
import { createApp } from "../src/app.js";

const ORIGIN = "https://whatyousignupfor.us";
const EXT_ID = "abcdefghijklmnopabcdefghijklmnop";

// A fake Stripe with just what the app calls. Webhook signatures: the "signature" is the literal string "ok".
function fakeStripe() {
  const subs = new Map();
  return {
    subs,
    customers: { create: async ({ email }) => ({ id: `cus_${email}` }) },
    checkout: { sessions: { create: async (p) => ({ url: `https://checkout.stripe.test/${p.customer}`, params: p }) } },
    billingPortal: { sessions: { create: async (p) => ({ url: `https://billing.stripe.test/${p.customer}` }) } },
    subscriptions: { retrieve: async (id) => subs.get(id) },
    webhooks: {
      constructEvent(body, sig) {
        if (sig !== "ok") throw new Error("bad signature");
        return JSON.parse(Buffer.from(body).toString("utf8"));
      },
    },
  };
}

async function setup({ llmCalls = { n: 0 } } = {}) {
  const db = openDb(":memory:");
  const stripe = fakeStripe();
  const llm = () => async () => {
    llmCalls.n++;
    return JSON.stringify({ claims: [{ text: "They can sell your data", category: "data_sold", sourceIndex: 0 }] });
  };
  const app = createApp({
    db, stripe, llm,
    config: { publicUrl: ORIGIN, extensionId: EXT_ID, stripePriceId: "price_123", stripeWebhookSecret: "whsec", secureCookies: false },
  });
  const server = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  const call = async (path, { method = "POST", body, headers = {}, auth } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
        ...(auth ? { authorization: `Bearer ${auth}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0].endsWith("=") ? "" : set.split(";")[0];
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json, headers: res.headers };
  };
  return { db, stripe, call, llmCalls, close: () => server.close(), clearCookie: () => { cookie = ""; } };
}

const SIGNUP = { name: "Ada", email: "ada@example.com", password: "correct horse battery", acceptTerms: true };

test("signup validates, creates a session, and rejects duplicates", async (t) => {
  const s = await setup(); t.after(s.close);
  const bad = await s.call("/api/signup", { body: { name: "", email: "nope", password: "short", acceptTerms: false } });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.json.fields).sort(), ["acceptTerms", "email", "name", "password"]);
  const ok = await s.call("/api/signup", { body: SIGNUP });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.user.plan, "free");
  assert.equal((await s.call("/api/me", { method: "GET" })).json.user.email, "ada@example.com");
  const dup = await s.call("/api/signup", { body: { ...SIGNUP, email: "ADA@example.com" } });
  assert.equal(dup.status, 409);
  const row = s.db.prepare("SELECT password_hash FROM users").get();
  assert.match(row.password_hash, /^scrypt\$/);
  assert.ok(!row.password_hash.includes(SIGNUP.password));
});

test("login uses one generic error and logout ends the session", async (t) => {
  const s = await setup(); t.after(s.close);
  await s.call("/api/signup", { body: SIGNUP });
  await s.call("/api/logout", { body: {} });
  assert.equal((await s.call("/api/me", { method: "GET" })).status, 401);
  const wrong = await s.call("/api/login", { body: { email: SIGNUP.email, password: "wrong password!!" } });
  const unknown = await s.call("/api/login", { body: { email: "nobody@example.com", password: "wrong password!!" } });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.json, unknown.json);
  assert.equal((await s.call("/api/login", { body: { email: SIGNUP.email, password: SIGNUP.password } })).status, 200);
  assert.equal((await s.call("/api/me", { method: "GET" })).status, 200);
});

test("CSRF: form posts and foreign origins are refused", async (t) => {
  const s = await setup(); t.after(s.close);
  const form = await s.call("/api/signup", { body: "name=x", headers: { "content-type": "application/x-www-form-urlencoded" } });
  assert.equal(form.status, 415);
  const foreign = await s.call("/api/signup", { body: SIGNUP, headers: { origin: "https://evil.example" } });
  assert.equal(foreign.status, 403);
  assert.equal((await s.call("/api/signup", { body: SIGNUP, headers: { origin: ORIGIN } })).status, 201);
});

test("login is rate limited", async (t) => {
  const s = await setup(); t.after(s.close);
  let last;
  for (let i = 0; i < 11; i++) last = await s.call("/api/login", { body: { email: "x@example.com", password: "nope nope nope" } });
  assert.equal(last.status, 429);
});

test("extension token, Pro gate, cached summaries", async (t) => {
  const s = await setup(); t.after(s.close);
  await s.call("/api/signup", { body: SIGNUP });
  const { json: { token } } = await s.call("/api/extension/token", { body: {} });
  assert.ok(token.length > 30);
  assert.equal((await s.call("/api/extension/me", { method: "GET", auth: token })).json.user.plan, "free");
  const text = "We may sell your personal data to advertisers.";
  const free = await s.call("/api/summarize", { body: { text, mode: "general" }, auth: token });
  assert.equal(free.status, 402);
  s.db.prepare("UPDATE users SET plan = 'pro'").run();
  const first = await s.call("/api/summarize", { body: { text, mode: "general" }, auth: token, headers: { origin: `chrome-extension://${EXT_ID}` } });
  assert.equal(first.status, 200);
  assert.equal(first.json.summary.engine, "ai");
  assert.equal(first.json.cached, false);
  const second = await s.call("/api/summarize", { body: { text, mode: "general" }, auth: token });
  assert.equal(second.json.cached, true);
  assert.equal(s.llmCalls.n, 1);
  // The cache stores the summary only: no user id, no URL.
  assert.deepEqual(Object.keys(s.db.prepare("SELECT * FROM summary_cache").get()).sort(), ["created_at", "key", "summary"]);
  assert.equal((await s.call("/api/summarize", { body: { text }, auth: "not-a-token" })).status, 401);
  await s.call("/api/extension/logout", { body: {}, auth: token });
  assert.equal((await s.call("/api/extension/me", { method: "GET", auth: token })).status, 401);
});

test("a web session cookie is not an extension token and vice versa", async (t) => {
  const s = await setup(); t.after(s.close);
  await s.call("/api/signup", { body: SIGNUP });
  const { json: { token } } = await s.call("/api/extension/token", { body: {} });
  s.clearCookie();
  assert.equal((await s.call("/api/me", { method: "GET", headers: { cookie: `sid=${token}` } })).status, 401);
});

test("checkout and webhook upgrade the account to Pro, cancel downgrades it", async (t) => {
  const s = await setup(); t.after(s.close);
  await s.call("/api/signup", { body: SIGNUP });
  const co = await s.call("/api/billing/checkout", { body: {} });
  assert.equal(co.status, 200);
  assert.match(co.json.url, /^https:\/\/checkout\.stripe\.test\/cus_ada@example\.com$/);
  const userId = s.db.prepare("SELECT id FROM users").get().id;
  s.stripe.subs.set("sub_1", { id: "sub_1", customer: "cus_ada@example.com", status: "active", items: { data: [{ current_period_end: 1800000000 }] } });
  const event = { id: "evt_1", type: "checkout.session.completed", data: { object: { client_reference_id: String(userId), customer: "cus_ada@example.com", subscription: "sub_1" } } };
  const forged = await s.call("/api/stripe/webhook", { body: event, headers: { "stripe-signature": "forged" } });
  assert.equal(forged.status, 400);
  assert.equal((await s.call("/api/me", { method: "GET" })).json.user.plan, "free");
  assert.equal((await s.call("/api/stripe/webhook", { body: event, headers: { "stripe-signature": "ok" } })).status, 200);
  const me = (await s.call("/api/me", { method: "GET" })).json.user;
  assert.equal(me.plan, "pro");
  assert.equal(me.currentPeriodEnd, 1800000000 * 1000);
  assert.equal((await s.call("/api/billing/portal", { body: {} })).json.url, "https://billing.stripe.test/cus_ada@example.com");
  const cancel = { id: "evt_2", type: "customer.subscription.deleted", data: { object: { id: "sub_1", customer: "cus_ada@example.com", status: "canceled" } } };
  await s.call("/api/stripe/webhook", { body: cancel, headers: { "stripe-signature": "ok" } });
  assert.equal((await s.call("/api/me", { method: "GET" })).json.user.plan, "free");
});

test("security headers are set", async (t) => {
  const s = await setup(); t.after(s.close);
  const r = await s.call("/api/config", { method: "GET" });
  assert.match(r.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.equal(r.headers.get("x-powered-by"), null);
  assert.equal(r.json.extensionId, EXT_ID);
});
