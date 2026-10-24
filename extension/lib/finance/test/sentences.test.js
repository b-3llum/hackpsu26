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
