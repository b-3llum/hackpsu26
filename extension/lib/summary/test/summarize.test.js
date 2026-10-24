import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summarize, scoreRisk } from "../summarize.js";
import { splitSentences } from "../../finance/sentences.js";

const fx = (n) => readFileSync(new URL(`../../finance/test/fixtures/${n}.txt`, import.meta.url), "utf8");

const PRIVACY = [
  "We may sell your personal information to advertisers.",
  "We use cookies and tracking technologies across sites.",
  "Any dispute will be resolved by binding arbitration.",
  "We may use your content to train our AI models.",
  "We may change these terms at any time.",
].join(" ");

test("rules only: cited claims and high risk", async () => {
  const r = await summarize(PRIVACY);
  const s = splitSentences(PRIVACY);
  assert.equal(r.engine, "rules");
  assert.equal(r.trust, 1);
  assert.equal(r.risk, "high");
  for (const c of r.claims) assert.equal(s[c.sourceIndex], c.sourceSentence);
  for (const k of ["data_sold", "tracking", "arbitration", "ai_training", "terms_change"]) assert.ok(r.claims.some((c) => c.category === k), k);
});

test("finance mode merges finance detectors", async () => {
  const general = await summarize(fx("bank-account"));
  const finance = await summarize(fx("bank-account"), { mode: "finance" });
  assert.ok(!general.claims.some((c) => c.category === "overdraft"));
  assert.ok(finance.claims.some((c) => c.category === "overdraft"));
});

test("clean policy is low risk", async () => {
  assert.equal((await summarize(fx("clean"), { mode: "finance" })).risk, "low");
});

test("negated statements are not flagged", async () => {
  const r = await summarize("We never sell your personal information. We do not use your content to train AI models.");
  assert.deepEqual(r.claims, []);
});

test("a negated clause does not hide a real one in the same sentence", async () => {
  const r = await summarize("We do not sell your data, but we share it with advertisers.");
  assert.ok(r.claims.some((c) => c.category === "data_sold"));
  const loc = await summarize("We collect your precise location, but we never sell it.");
  assert.ok(loc.claims.some((c) => c.category === "location"));
  assert.deepEqual((await summarize("We do not sell your personal information.")).claims, []);
});

test("sharing with service providers is not selling", async () => {
  const r = await summarize("We share your information with service providers who help us run the app.");
  assert.ok(!r.claims.some((c) => c.category === "data_sold"));
  const s = await summarize("We may share your information with advertising partners.");
  assert.ok(s.claims.some((c) => c.category === "data_sold"));
});

test("empty input", async () => {
  assert.deepEqual(await summarize(""), { risk: "low", claims: [], trust: 1, engine: "rules" });
});

test("ai claims with bad citations are dropped and lower trust", async () => {
  const llm = async () => JSON.stringify({ claims: [
    { text: "They sell your data", category: "data_sold", sourceIndex: 0 },
    { text: "Made up claim", category: "other", sourceIndex: 99 },
  ] });
  const r = await summarize(PRIVACY, { llm });
  assert.equal(r.engine, "ai");
  assert.ok(!r.claims.some((c) => c.text === "Made up claim"));
  assert.ok(r.claims.some((c) => c.source === "ai" && c.sourceIndex === 0));
  assert.ok(r.trust < 1 && r.trust > 0);
  // Rule claims not covered by the AI are kept.
  assert.ok(r.claims.some((c) => c.source === "rules" && c.category === "arbitration"));
});

test("ai failure falls back to rules", async () => {
  const r = await summarize(PRIVACY, { llm: async () => { throw new Error("no key"); } });
  assert.equal(r.engine, "rules");
  const junk = await summarize(PRIVACY, { llm: async () => "not json" });
  assert.equal(junk.engine, "rules");
});

test("scoreRisk thresholds", () => {
  assert.equal(scoreRisk([]), "low");
  assert.equal(scoreRisk([{ category: "tracking" }]), "low");
  assert.equal(scoreRisk([{ category: "tracking" }, { category: "location" }]), "medium");
  assert.equal(scoreRisk([{ category: "arbitration" }, { category: "data_sold" }]), "high");
});

test("ai categories outside the allowed list become other", async () => {
  let prompt;
  const llm = async (p) => { prompt = p; return JSON.stringify({ claims: [
    { text: "Terms can change", category: "rate_changes", sourceIndex: 4 },
    { text: "Arbitration", category: "arbitration", sourceIndex: 2 },
  ] }); };
  const r = await summarize(PRIVACY, { llm });
  assert.match(prompt, /data_sold, tracking/);
  assert.ok(!/overdraft/.test(prompt.split("\n").find((l) => l.startsWith("Use one of"))), "finance categories only in finance mode");
  assert.equal(r.claims.find((c) => c.text === "Terms can change").category, "other");
  assert.equal(r.claims.find((c) => c.text === "Arbitration").category, "arbitration");
});

test("real site false positives stay quiet", async () => {
  const quiet = [
    "We don’t track you through cookies or any other storage methods.",
    "We have never sold any personal information.",
    "Video quality may be affected by your location and bandwidth.",
    "Cookie Preferences",
    "We offer settings that use anonymous cookies for storage.",
    "We only keep it for as long as necessary for the stated purpose.",
  ];
  for (const t of quiet) assert.deepEqual((await summarize(t)).claims.map((c) => c.category), [], t);
});

test("real tracking and location still flag", async () => {
  const cats = async (t) => (await summarize(t)).claims.map((c) => c.category);
  assert.ok((await cats("We use cookies to show you personalized ads.")).includes("tracking"));
  assert.ok((await cats("Our partners use third-party cookies to measure ad performance.")).includes("tracking"));
  assert.ok((await cats("We collect your precise location when the app is open.")).includes("location"));
  assert.ok((await cats("We may access your device location to suggest nearby stores.")).includes("location"));
});
