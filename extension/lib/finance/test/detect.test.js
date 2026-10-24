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
