// End to end check of the judge demo: SnapPix terms v1 to v2 through the same code the service worker runs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { htmlToText, diffSentences } from "../lib/policy.js";
import { summarize } from "../lib/summary/summarize.js";
import { suggestActions } from "../lib/actions/actions.js";

const page = (f) => htmlToText(readFileSync(new URL(`../demo/${f}`, import.meta.url), "utf8"));
const BANNER = "We use cookies to personalize ads and analytics. By clicking Accept all you agree to our Terms and Privacy Policy.";
const receipt = (terms) => [BANNER, page(terms), page("privacy.html")].join("\n");

test("v1 is not high risk, v2 is high risk with finance flags", async () => {
  const v1 = await summarize(receipt("terms-v1.html"), { mode: "finance" });
  const v2 = await summarize(receipt("terms-v2.html"), { mode: "finance" });
  assert.notEqual(v1.risk, "high");
  assert.equal(v2.risk, "high");
  const cats = new Set(v2.claims.map((c) => c.category));
  for (const k of ["data_sold", "location", "biometrics", "ai_training", "arbitration", "auto_renewal", "late_payment"]) assert.ok(cats.has(k), k);
  for (const c of v2.claims) assert.ok(receipt("terms-v2.html").includes(c.sourceSentence), c.sourceSentence);
});

test("diff shows the new clauses", () => {
  const { added } = diffSentences(page("terms-v1.html"), page("terms-v2.html"));
  assert.ok(added.some((s) => /sell your personal data/.test(s)));
  assert.ok(added.some((s) => /late fee/.test(s)));
});

test("htmlToText keeps paragraphs apart and drops scripts", () => {
  const t = htmlToText("<header>Menu</header><main><p>One clause</p><script>x()</script><p>Two &amp; three</p></main>");
  assert.equal(t, "One clause\nTwo & three");
});

test("v2 receipt suggests next actions with drafts", async () => {
  const summary = await summarize(receipt("terms-v2.html"), { mode: "finance" });
  const kinds = suggestActions({ domain: "snappix.example", summary, policies: [] }).map((a) => a.kind);
  for (const k of ["opt_out_sale", "opt_out_ai_training", "arbitration_opt_out", "cancel_before_renewal"]) assert.ok(kinds.includes(k), k);
});

test("htmlToText decodes hex entities", () => {
  assert.equal(htmlToText("<p>we&#x27;ve &#39;ok&#39;</p>"), "we've 'ok'");
});
