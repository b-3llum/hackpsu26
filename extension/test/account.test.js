import test from "node:test";
import assert from "node:assert/strict";

// Minimal chrome.storage.local for lib/account.js.
const store = {};
globalThis.chrome = { storage: { local: {
  get: async (k) => (k in store ? { [k]: store[k] } : {}),
  set: async (o) => Object.assign(store, o),
  remove: async (k) => { delete store[k]; },
} } };
const { serverSummary, refreshAccount, signOut, getAccount, setAccount } = await import("../lib/account.js");
const { SITE } = await import("../lib/settings.js");

const reply = (status, body) => async (url, init) => { reply.last = { url, init }; return { status, ok: status < 400, json: async () => body }; };

test("signed out: no request", async () => {
  delete store.account;
  let called = false;
  assert.equal(await serverSummary("text", "general", { fetchImpl: async () => { called = true; } }), null);
  assert.equal(called, false);
});

test("Pro: returns the server summary with a bearer token and caps the text", async () => {
  await setAccount({ token: "t1", email: "a@b.c", plan: "free" });
  const summary = { engine: "ai", risk: "high", claims: [], trust: 1 };
  const fetchImpl = reply(200, { summary });
  assert.deepEqual(await serverSummary("x".repeat(70000), "finance", { fetchImpl }), summary);
  assert.equal(reply.last.url, `${SITE}/api/summarize`);
  assert.equal(reply.last.init.headers.Authorization, "Bearer t1");
  const body = JSON.parse(reply.last.init.body);
  assert.equal(body.text.length, 60000);
  assert.equal(body.mode, "finance");
  assert.equal((await getAccount()).plan, "pro");
});

test("Free (402) keeps the account and marks it free; 401 signs out", async () => {
  await setAccount({ token: "t1", email: "a@b.c", plan: "pro" });
  assert.equal(await serverSummary("t", "general", { fetchImpl: reply(402, {}) }), null);
  assert.equal((await getAccount()).plan, "free");
  assert.equal(await serverSummary("t", "general", { fetchImpl: reply(401, {}) }), null);
  assert.equal(await getAccount(), null);
});

test("refreshAccount updates the plan; signOut clears it", async () => {
  await setAccount({ token: "t2", email: "a@b.c", plan: "free" });
  const acct = await refreshAccount({ fetchImpl: reply(200, { user: { email: "a@b.c", name: "A", plan: "pro" } }) });
  assert.equal(acct.plan, "pro");
  await signOut({ fetchImpl: reply(200, { ok: true }) });
  assert.equal(reply.last.url, `${SITE}/api/extension/logout`);
  assert.equal(await getAccount(), null);
});
