import test from "node:test";
import assert from "node:assert/strict";
import { suggestActions, ACTION_KINDS } from "../actions.js";

const r = (cats, extra = {}) => ({
  domain: "example.com",
  summary: { claims: cats.map((category, i) => ({ category, sourceSentence: `Sentence ${i} about ${category}.` })) },
  policies: [{ url: "https://example.com/terms", type: "terms" }, { url: "https://example.com/privacy", type: "privacy" }],
  ...extra,
});

test("empty or malformed receipts give no actions", () => {
  assert.deepEqual(suggestActions(undefined), []);
  assert.deepEqual(suggestActions({}), []);
  assert.deepEqual(suggestActions({ summary: { claims: "nope" } }), []);
  assert.deepEqual(suggestActions(r(["other", "unknown"])), []);
});

test("privacy claims map to opt out and deletion with the privacy link", () => {
  const a = suggestActions(r(["data_sold", "retention", "biometrics"]));
  assert.deepEqual(a.map((x) => x.kind), ["opt_out_sale", "delete_account"]);
  assert.equal(a[0].link, "https://example.com/privacy");
  assert.equal(a[0].sourceSentence, "Sentence 0 about data_sold.");
  assert.match(a[0].draft, /example\.com/);
  assert.equal(a[1].category, "retention");
});

test("subscription and finance claims map to terms actions", () => {
  const a = suggestActions(r(["fee", "auto_renewal", "overdraft", "late_payment"]));
  assert.deepEqual(a.map((x) => x.kind), ["cancel_before_renewal", "avoid_overdraft", "payment_reminder", "review_fees"]);
  for (const x of a) assert.equal(x.link, "https://example.com/terms");
});

test("output follows ACTION_KINDS order and has the documented shape", () => {
  const all = ["terms_change", "fee", "watch", "interest_rate_change", "minimum_balance", "late_payment", "location", "tracking",
    "biometrics", "overdraft", "auto_renewal", "arbitration", "ai_training", "data_sold"];
  const a = suggestActions(r(all));
  assert.deepEqual(a.map((x) => x.kind), ACTION_KINDS);
  for (const x of a) {
    assert.equal(typeof x.title, "string");
    assert.equal(typeof x.why, "string");
    assert.ok(x.draft === null || typeof x.draft === "string");
    assert.doesNotMatch(x.title + x.why + (x.draft || ""), /[\u2013\u2014]/);
  }
});

test("unsafe or missing policy links are dropped, falling back to any safe link", () => {
  const a = suggestActions(r(["data_sold"], { policies: [{ url: "javascript:alert(1)", type: "privacy" }, { url: "https://example.com/terms", type: "terms" }] }));
  assert.equal(a[0].link, "https://example.com/terms");
  const b = suggestActions(r(["data_sold"], { policies: [{ url: "not a url", type: "privacy" }] }));
  assert.equal(b[0].link, undefined);
  assert.ok(!("link" in b[0]));
});

test("tracking prefers a cookie policy, then privacy", () => {
  assert.equal(suggestActions(r(["tracking"]))[0].link, "https://example.com/privacy");
  const p = [{ url: "https://example.com/cookies", type: "cookie" }, { url: "https://example.com/privacy", type: "privacy" }];
  assert.equal(suggestActions(r(["tracking"], { policies: p }))[0].link, "https://example.com/cookies");
});

test("missing domain uses a neutral name", () => {
  assert.match(suggestActions(r(["data_sold"], { domain: "" }))[0].draft, /this site privacy team/);
});

test("integrates with real lib/finance hits", async () => {
  const { detectFinance } = await import("../../finance/detect.js");
  const hits = detectFinance("Your plan renews automatically until you cancel. An overdraft fee of $35 applies.");
  const a = suggestActions({ domain: "bank.test", summary: { claims: hits.map((h) => ({ category: h.category, sourceSentence: h.sentence })) }, policies: [] });
  assert.ok(a.some((x) => x.kind === "cancel_before_renewal"));
  assert.ok(a.some((x) => x.kind === "avoid_overdraft"));
});
