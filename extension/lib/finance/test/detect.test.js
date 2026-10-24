import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectFinance, FINANCE_LABELS, FINANCE_CATEGORIES } from "../detect.js";
import { splitSentences } from "../sentences.js";

const fx = (n) => readFileSync(new URL(`./fixtures/${n}.txt`, import.meta.url), "utf8");
const cats = (hits) => new Set(hits.map((h) => h.category));

test("labels cover every category exactly", () => {
  assert.deepEqual(Object.keys(FINANCE_LABELS).sort(), [...FINANCE_CATEGORIES].sort());
  assert.deepEqual([...FINANCE_CATEGORIES].sort(), ["auto_renewal", "fee", "interest_rate_change", "late_payment", "minimum_balance", "overdraft"]);
});

for (const name of ["bank-account", "streaming", "loan", "clean"]) {
  test(`sentenceIndex matches splitSentences for ${name}`, () => {
    const text = fx(name);
    const s = splitSentences(text);
    for (const h of detectFinance(text)) assert.equal(s[h.sentenceIndex], h.sentence);
  });
}

test("bank account agreement", () => {
  const c = cats(detectFinance(fx("bank-account")));
  for (const k of ["fee", "overdraft", "minimum_balance", "interest_rate_change"]) assert.ok(c.has(k), k);
  assert.ok(!detectFinance(fx("bank-account")).some((h) => /online statements/.test(h.sentence)));
});

test("streaming subscription", () => {
  const c = cats(detectFinance(fx("streaming")));
  assert.ok(c.has("auto_renewal"));
  assert.ok(c.has("late_payment"));
  assert.ok(!detectFinance(fx("streaming")).some((h) => /cancellation fee/.test(h.sentence)));
});

test("loan disclosure", () => {
  const c = cats(detectFinance(fx("loan")));
  for (const k of ["interest_rate_change", "fee", "late_payment"]) assert.ok(c.has(k), k);
  assert.ok(!detectFinance(fx("loan")).some((h) => /prepayment penalty/.test(h.sentence)));
});

test("clean policy has no hits", () => {
  assert.deepEqual(detectFinance(fx("clean")), []);
});

test("negation handling", () => {
  assert.deepEqual(detectFinance("There are no overdraft fees."), []);
  assert.deepEqual(detectFinance("We will not charge you a fee."), []);
  assert.ok(detectFinance("No fee for ATM use, but wires cost $15.").length > 0);
});

test("empty input", () => assert.deepEqual(detectFinance(""), []));

// Regression tests from the PR #5 review.
const catList = (t) => detectFinance(t).map((h) => h.category);

test("dollar amounts after a space match as fees", () => {
  assert.deepEqual(catList("A charge of $35 applies to each returned item."), ["fee"]);
  assert.deepEqual(catList("You will be charged $35."), ["fee"]);
});

test("negation does not over match", () => {
  assert.deepEqual(catList("Pay no later than the 1st or a late fee applies."), ["late_payment"]);
  assert.deepEqual(catList("No fee is charged for the first transfer, and each one after costs $3."), ["fee"]);
  assert.deepEqual(catList("There are no fees for deposits, and your interest rate may change at any time."), ["interest_rate_change"]);
  assert.deepEqual(catList("There is no fee for the first transfer then $3 each."), ["fee"]);
});

test("negation still cancels what it negates", () => {
  assert.deepEqual(catList("There are no overdraft fees."), []);
  assert.deepEqual(catList("This account is free of charge."), []);
  assert.deepEqual(catList("We do not renew your plan automatically."), []);
});

test("overdraft fee without an amount is not double counted as a generic fee", () => {
  assert.deepEqual(catList("An overdraft fee will apply if you overdraw your account."), ["overdraft"]);
  assert.deepEqual(catList("We may charge an overdraft fee of $35."), ["fee", "overdraft"]);
});

test("hard wrapped and U.S. text keeps sentenceIndex aligned", () => {
  const text = "These terms are governed by the laws of the U.S. You may be charged a monthly\nmaintenance fee of $12.";
  const hits = detectFinance(text);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].sentenceIndex, 1);
  assert.equal(hits[0].sentence, "You may be charged a monthly maintenance fee of $12.");
});

// Real page regressions (DuckDuckGo privacy, Netflix terms) from the board, Oct 24.
test("feedback is not a fee", () => {
  assert.deepEqual(catList("Feedback ."), []);
  assert.deepEqual(catList("You can choose to provide feedback (such as in a crash report) to help us improve."), []);
  assert.deepEqual(catList("A $5 fee applies."), ["fee"]);
  assert.deepEqual(catList("Fees may apply."), ["fee"]);
});

test("a failed payment is not an overdraft", () => {
  assert.deepEqual(catList("If a payment is not successfully settled, due to expiration, insufficient funds, or otherwise, and you do not cancel your account, we may suspend your access to the service."), []);
  assert.ok(catList("We charge a $35 fee for each item returned for insufficient funds.").includes("overdraft"));
  assert.ok(catList("An NSF fee of $30 applies.").includes("overdraft"));
  assert.ok(catList("Insufficient funds items are charged $34 each.").includes("overdraft"));
  assert.ok(catList("If your account is overdrawn, we may close it.").includes("overdraft"));
});
