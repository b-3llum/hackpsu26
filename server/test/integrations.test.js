import test from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db.js";
import { createApp } from "../src/app.js";
import { receiptScript, listenInput, listScript, spokenNarration, narrationPrompt } from "../src/speech.js";

const ORIGIN = "https://whatyousignupfor.us";

async function setup(extra = {}) {
  const db = openDb(":memory:");
  const app = createApp({ db, stripe: null, llm: () => null, config: { publicUrl: ORIGIN, extensionId: "x".repeat(32), secureCookies: false }, ...extra });
  const server = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, { method = "POST", body, auth, cookie } = {}) => fetch(base + path, {
    method, redirect: "manual",
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(auth ? { authorization: `Bearer ${auth}` } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const signup = async (email = "ada@example.com", password = "correct horse battery") => {
    const r = await call("/api/signup", { body: { name: "Ada", email, password, acceptTerms: true } });
    const cookie = r.headers.get("set-cookie").split(";")[0];
    const { token } = await (await call("/api/extension/token", { body: {}, cookie })).json();
    return { cookie, token };
  };
  return { db, call, signup, close: () => server.close() };
}

const SUMMARY = { risk: "high", claims: [{ text: "They can sell your data" }, { text: "They can sell your data" }, { text: "You give up the right to sue in court." }] };

test("receiptScript: risk, unique points, no site name, capped length", () => {
  const s = receiptScript({ ...SUMMARY, domain: "secret.example" });
  assert.equal(s, "Here is your consent receipt. Overall risk: high. What you agreed to: They can sell your data. You give up the right to sue in court.");
  assert.ok(!s.includes("secret.example"));
  const long = receiptScript({ risk: "low", claims: Array.from({ length: 200 }, (_, i) => ({ text: `Point number ${i} about something that the policy says in a fairly long sentence` })) });
  assert.ok(long.length <= 1240 && long.endsWith("And more points in the receipt."));
});

test("speak: off without a key, 3 free listens a day, cached audio, unlimited Pro", async (t) => {
  let calls = 0;
  const speech = async () => { calls++; return Buffer.from("ID3fake-mp3"); };
  const s = await setup({ speech }); t.after(s.close);
  const { token } = await s.signup();
  for (let i = 0; i < 3; i++) {
    const r = await s.call("/api/speak", { body: { summary: SUMMARY }, auth: token });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "audio/mpeg");
    assert.equal(Buffer.from(await r.arrayBuffer()).toString(), "ID3fake-mp3");
  }
  assert.equal(calls, 1, "same script is synthesized once");
  assert.equal((await s.call("/api/speak", { body: { summary: SUMMARY }, auth: token })).status, 402);
  s.db.prepare("UPDATE users SET plan = 'pro'").run();
  assert.equal((await s.call("/api/speak", { body: { summary: SUMMARY }, auth: token })).status, 200);
  assert.equal((await s.call("/api/speak", { body: { summary: SUMMARY } })).status, 401);
  // A failing provider returns 502 and does not use up a free listen.
  const broken = await setup({ speech: async () => { throw new Error("ElevenLabs 401"); } }); t.after(broken.close);
  const b = await broken.signup();
  for (let i = 0; i < 4; i++) assert.equal((await broken.call("/api/speak", { body: { summary: SUMMARY }, auth: b.token })).status, 502);
  assert.equal(broken.db.prepare("SELECT count(*) AS n FROM listen_usage").get().n, 0);
  const off = await setup(); t.after(off.close);
  const o = await off.signup();
  assert.equal((await off.call("/api/speak", { body: { summary: SUMMARY }, auth: o.token })).status, 503);
});

test("change tracker: signed in reports, public reads, bad input refused", async (t) => {
  const recorded = [];
  const changes = {
    record: async (c) => { recorded.push(c); return 2; },
    recent: async () => ({ events: [{ host: "a.com" }], byHost: [], perDay: [] }),
    countForUrl: async () => 2,
  };
  const s = await setup({ changes }); t.after(s.close);
  const { token } = await s.signup();
  const report = { url: "https://a.com/terms?x=1", hashAfter: "abc", riskBefore: "medium", riskAfter: "high", added: 3, removed: 1 };
  assert.equal((await s.call("/api/changes", { body: report })).status, 401);
  const r = await s.call("/api/changes", { body: report, auth: token });
  assert.deepEqual(await r.json(), { changes90d: 2 });
  assert.equal(recorded[0].url, "https://a.com/terms?x=1");
  assert.ok(!("userId" in recorded[0]) && !("email" in recorded[0]), "no user identity is sent to the tracker");
  assert.equal((await s.call("/api/changes", { body: { ...report, url: "javascript:alert(1)" }, auth: token })).status, 400);
  for (const url of ["http://127.0.0.1:8765/terms-v2.html", "http://localhost/terms", "http://intranet/terms", "http://[::1]/t", "http://printer.local/t"]) {
    assert.deepEqual(await (await s.call("/api/changes", { body: { ...report, url }, auth: token })).json(), { changes90d: null, skipped: "not a public site" }, url);
  }
  assert.equal(recorded.length, 1, "local hosts are never recorded");
  assert.equal((await (await s.call("/api/changes", { method: "GET" })).json()).events[0].host, "a.com");
  assert.equal((await (await s.call(`/api/changes/count?url=${encodeURIComponent("https://a.com/terms")}`, { method: "GET" })).json()).changes90d, 2);
});

test("Auth0: state is checked, new users are created, existing email accounts are linked safely", async (t) => {
  let profile = { sub: "google-oauth2|1", email: "ada@example.com", emailVerified: true, name: "Ada G" };
  const auth0 = { start: () => ({ url: "https://tenant.auth0.com/authorize?x", state: `st${Math.random()}`, verifier: "v" }), finish: async () => profile };
  const s = await setup({ auth0 }); t.after(s.close);
  // An attacker pre-registers the victim's email with a password they know.
  const attacker = await s.signup("ada@example.com", "attacker password!!");
  const start = await s.call("/auth/google?ext=1", { method: "GET" });
  assert.equal(start.status, 302);
  assert.match(start.headers.get("location"), /^https:\/\/tenant\.auth0\.com\/authorize/);
  const state = s.db.prepare("SELECT state FROM oauth_states").get().state;
  assert.equal((await s.call("/auth/callback?code=c&state=forged", { method: "GET" })).headers.get("location"), "/login?error=google");
  const cb = await s.call(`/auth/callback?code=c&state=${state}`, { method: "GET" });
  assert.equal(cb.headers.get("location"), "/account?connect=1");
  const cookie = cb.headers.get("set-cookie").split(";")[0];
  assert.equal((await (await s.call("/api/me", { method: "GET", cookie })).json()).user.email, "ada@example.com");
  // The old password and its sessions no longer work.
  assert.equal((await s.call("/api/login", { body: { email: "ada@example.com", password: "attacker password!!" } })).status, 401);
  assert.equal((await s.call("/api/me", { method: "GET", cookie: attacker.cookie })).status, 401);
  assert.equal((await s.call("/api/extension/me", { method: "GET", auth: attacker.token })).status, 401);
  assert.equal(s.db.prepare("SELECT count(*) AS n FROM users").get().n, 1);
  // State is single use; unverified emails are refused.
  assert.equal((await s.call(`/auth/callback?code=c&state=${state}`, { method: "GET" })).headers.get("location"), "/login?error=google");
  profile = { sub: "google-oauth2|2", email: "new@example.com", emailVerified: false, name: "N" };
  await s.call("/auth/google", { method: "GET" });
  const st2 = s.db.prepare("SELECT state FROM oauth_states").get().state;
  assert.equal((await s.call(`/auth/callback?code=c&state=${st2}`, { method: "GET" })).headers.get("location"), "/login?error=unverified");
});

test("config reports which integrations are on", async (t) => {
  const s = await setup({ speech: async () => Buffer.alloc(0) }); t.after(s.close);
  const cfg = await (await s.call("/api/config", { method: "GET" })).json();
  assert.deepEqual([cfg.listen, cfg.tracker, cfg.google], [true, false, false]);
});

test("FREE_PRO: every account gets Pro features and checkout is off", async (t) => {
  const s = await setup({
    config: { publicUrl: ORIGIN, extensionId: "x".repeat(32), secureCookies: false, freePro: true },
    llm: () => async () => JSON.stringify({ claims: [{ text: "They can sell your data", category: "data_sold", sourceIndex: 0 }] }),
    speech: async () => Buffer.from("ID3audio"),
  });
  t.after(s.close);
  const { cookie, token } = await s.signup();
  assert.equal((await (await s.call("/api/me", { method: "GET", cookie })).json()).user.plan, "pro");
  const cfg = await (await s.call("/api/config", { method: "GET" })).json();
  assert.equal(cfg.freePro, true);
  assert.equal(cfg.billing, false);
  const sum = await s.call("/api/summarize", { body: { text: "We may sell your personal data to advertisers." }, auth: token });
  assert.equal(sum.status, 200);
  assert.equal((await sum.json()).summary.engine, "ai");
  for (let i = 0; i < 5; i++) assert.equal((await s.call("/api/speak", { body: { summary: SUMMARY }, auth: token })).status, 200, "no daily listen cap");
  assert.equal((await s.call("/api/billing/checkout", { body: {}, cookie })).status, 409);
  assert.equal(s.db.prepare("SELECT plan FROM users").get().plan, "free", "stored plan is untouched, so paid Pro can come back");
});

test("listenInput: site, unique capped points with sources, actions; junk dropped", () => {
  const input = listenInput({
    site: "WWW.SnapPix.com",
    summary: { risk: "HIGH", claims: [
      { text: "They can sell your data", sourceSentence: "We may sell your personal data to advertising partners." },
      { text: "they can sell your data", sourceSentence: "duplicate" },
      { text: "" },
    ] },
    actions: ["Opt out of the sale or sharing of your data", 42],
  });
  assert.deepEqual(input, {
    site: "snappix.com",
    risk: "high",
    points: [{ text: "They can sell your data", source: "We may sell your personal data to advertising partners." }],
    actions: ["Opt out of the sale or sharing of your data", "42"],
  });
  assert.equal(listenInput({ site: "<script>", summary: {} }).site, "");
  assert.match(listScript(input), /^Here is your consent receipt for snappix\.com\. Overall risk: high\./);
});

test("spoken narration: Gemini writes it from the cited sentences, cleaned; falls back on failure", async () => {
  const input = listenInput({ site: "snappix.com", summary: { risk: "high", claims: [{ text: "They can sell your data", sourceSentence: "We may sell your personal data to advertising partners." }] }, actions: ["Opt out of the sale"] });
  let prompt;
  const llm = async (p) => { prompt = p; return JSON.stringify({ narration: "You agreed to **SnapPix**'s terms \u2014 and the risk is high. They can sell your personal data to advertising partners. Your best next step is to opt out of the sale." }); };
  const text = await spokenNarration(llm, input);
  assert.equal(text, "You agreed to SnapPix's terms, and the risk is high. They can sell your personal data to advertising partners. Your best next step is to opt out of the sale.");
  assert.match(prompt, /Site: snappix\.com/);
  assert.match(prompt, /Policy says: "We may sell your personal data to advertising partners\."/);
  assert.match(prompt, /Begin exactly like this: "You agreed to <site name>'s terms\. The overall risk is high\."/);
  assert.match(prompt, /starts "Your best next step:" and says this in plain words: Opt out of the sale\./);
  assert.equal(await spokenNarration(async () => { throw new Error("down"); }, input), null);
  assert.equal(await spokenNarration(async () => "not json", input), null);
  assert.equal(await spokenNarration(null, input), null);
  assert.equal(narrationPrompt(input).includes("No lists"), true);
});

test("speak: reads the Gemini narration, generated once per receipt", async (t) => {
  const scripts = [];
  let llmCalls = 0;
  const s = await setup({
    llm: () => async () => { llmCalls++; return JSON.stringify({ narration: "You agreed to SnapPix's terms, and the risk is high. They can sell your personal data to advertising partners." }); },
    speech: async (script) => { scripts.push(script); return Buffer.from("ID3audio"); },
  });
  t.after(s.close);
  const { token } = await s.signup();
  const body = { site: "snappix.com", summary: { risk: "high", claims: [{ text: "They can sell your data", sourceSentence: "We may sell your personal data to advertising partners." }] }, actions: [] };
  assert.equal((await s.call("/api/speak", { body, auth: token })).status, 200);
  assert.equal((await s.call("/api/speak", { body, auth: token })).status, 200);
  assert.deepEqual(scripts, ["You agreed to SnapPix's terms, and the risk is high. They can sell your personal data to advertising partners."]);
  assert.equal(llmCalls, 1, "cached after the first listen");
  // A different site is a different receipt.
  assert.equal((await s.call("/api/speak", { body: { ...body, site: "other.com" }, auth: token })).status, 200);
  assert.equal(llmCalls, 2);
});
