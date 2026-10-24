import test from "node:test";
import assert from "node:assert/strict";
import { splitSentences } from "../sentences.js";

test("abbreviations do not split", () => {
  const s = splitSentences("Fees apply, e.g. wires. Rules follow U.S. law, i.e. federal. Acme Inc. agrees. Done.");
  assert.deepEqual(s, ["Fees apply, e.g. wires.", "Rules follow U.S. law, i.e. federal.", "Acme Inc. agrees.", "Done."]);
});
test("decimals do not split", () => {
  assert.deepEqual(splitSentences("Rate is 2.5% now. It may rise to 3.75%."), ["Rate is 2.5% now.", "It may rise to 3.75%."]);
});
test("bullets and newlines split and strip markers", () => {
  assert.deepEqual(splitSentences("Header\n- one item\n* two item\n1. three\n\u2022 four"), ["Header", "one item", "two item", "three", "four"]);
});
test("empty input", () => {
  assert.deepEqual(splitSentences(""), []);
  assert.deepEqual(splitSentences(null), []);
});
test("question and exclamation", () => {
  assert.deepEqual(splitSentences("Why? Because! Ok."), ["Why?", "Because!", "Ok."]);
});

// Regression tests from the PR #5 review.
test("U.S. at the end of a sentence splits before a sentence starter", () => {
  assert.deepEqual(splitSentences("This is governed by the laws of the U.S. You may be charged a fee."),
    ["This is governed by the laws of the U.S.", "You may be charged a fee."]);
  assert.deepEqual(splitSentences("Rules follow U.S. law."), ["Rules follow U.S. law."]);
});
test("hard wrapped lines are joined", () => {
  assert.deepEqual(splitSentences("We may charge you a monthly\nmaintenance fee of $12."), ["We may charge you a monthly maintenance fee of $12."]);
  assert.deepEqual(splitSentences("Fees apply to each wire transfer,\nincluding international ones."), ["Fees apply to each wire transfer, including international ones."]);
});
test("real line breaks stay breaks", () => {
  assert.deepEqual(splitSentences("Account Terms\nYou agree to these terms.\n- item one\n- item two"), ["Account Terms", "You agree to these terms.", "item one", "item two"]);
});
