import test from "node:test";
import assert from "node:assert/strict";
import { geminiLlm, GEMINI_BASE, DEFAULT_MODEL } from "../src/gemini.js";

const reply = (body, ok = true, status = 200) => async () => ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) });

test("no key means no llm", () => {
  assert.equal(geminiLlm({ apiKey: "" }), null);
});

test("sends a generateContent request with the key in a header", async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return reply({ candidates: [{ content: { parts: [{ text: "{\"claims\":[]}" }] } }] })();
  };
  const out = await geminiLlm({ apiKey: "k", fetchImpl })("hello");
  assert.equal(out, "{\"claims\":[]}");
  assert.equal(seen.url, `${GEMINI_BASE}/models/${DEFAULT_MODEL}:generateContent`);
  assert.equal(seen.init.headers["x-goog-api-key"], "k");
  assert.ok(!seen.url.includes("key="));
  const body = JSON.parse(seen.init.body);
  assert.equal(body.contents[0].parts[0].text, "hello");
  assert.equal(body.generationConfig.responseMimeType, "application/json");
});

test("skips thought parts and joins text parts", async () => {
  const fetchImpl = reply({ candidates: [{ content: { parts: [{ text: "thinking", thought: true }, { text: "{\"a\":" }, { text: "1}" }] } }] });
  assert.equal(await geminiLlm({ apiKey: "k", fetchImpl })("x"), "{\"a\":1}");
});

test("http errors and empty replies throw", async () => {
  await assert.rejects(geminiLlm({ apiKey: "k", fetchImpl: reply({ error: "bad key" }, false, 400) })("x"), /Gemini 400/);
  await assert.rejects(geminiLlm({ apiKey: "k", fetchImpl: reply({ candidates: [] }) })("x"), /no text/);
});

test("model name accepts a models/ prefix", async () => {
  let url;
  await geminiLlm({ apiKey: "k", model: "models/gemini-x", fetchImpl: async (u) => { url = u; return reply({ candidates: [{ content: { parts: [{ text: "{}" }] } }] })(); } })("x");
  assert.ok(url.endsWith("/models/gemini-x:generateContent"));
});
