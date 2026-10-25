// ElevenLabs text to speech for "Listen to this receipt". The key stays on the server.
export const ELEVEN_BASE = "https://api.elevenlabs.io/v1";
export const DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb";
export const DEFAULT_TTS_MODEL = "eleven_flash_v2_5";
const MAX_SCRIPT = 1200;
// Bump when the narration prompt changes, so cached audio is regenerated.
export const NARRATION_VERSION = "n1";

/** @returns {((text: string) => Promise<Buffer>) | null} null when no key is set */
export function elevenSpeech({ apiKey, voiceId = DEFAULT_VOICE, model = DEFAULT_TTS_MODEL, fetchImpl = fetch, timeoutMs = 20000 }) {
  if (!apiKey) return null;
  return async (text) => {
    const res = await fetchImpl(`${ELEVEN_BASE}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: model }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return Buffer.from(await res.arrayBuffer());
  };
}

const RISK_WORDS = { low: "low", medium: "medium", high: "high" };
const clip = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/**
 * What Listen may use, cleaned and capped: the site, the risk, each point with the policy sentence behind it,
 * and the suggested next steps. Everything here comes from the user's own receipt.
 */
export function listenInput(body) {
  const summary = body?.summary || {};
  const host = clip(body?.site, 100).toLowerCase();
  const site = /^[a-z0-9.-]+$/.test(host) ? host.replace(/^www\./, "") : "";
  const seen = new Set();
  const points = (Array.isArray(summary.claims) ? summary.claims : []).slice(0, 30)
    .map((c) => ({ text: clip(c?.text, 200), source: clip(c?.sourceSentence, 400) }))
    .filter((p) => p.text && !seen.has(p.text.toLowerCase()) && seen.add(p.text.toLowerCase()));
  const actions = (Array.isArray(body?.actions) ? body.actions : []).slice(0, 5).map((a) => clip(a, 120)).filter(Boolean);
  return { site, risk: RISK_WORDS[String(summary.risk).toLowerCase()] || "unknown", points, actions };
}

/** The plain list, read when Gemini is unavailable. */
export function listScript(input) {
  const where = input.site ? ` for ${input.site}` : "";
  let script = `Here is your consent receipt${where}. Overall risk: ${input.risk}.`;
  script += input.points.length ? " What you agreed to:" : " Nothing notable was found.";
  for (const { text } of input.points) {
    const t = /[.!?]$/.test(text) ? text : `${text}.`;
    if (script.length + t.length + 1 > MAX_SCRIPT) { script += " And more points in the receipt."; break; }
    script += ` ${t}`;
  }
  return script;
}

/** Kept for callers that only have a summary. */
export function receiptScript(summary) {
  return listScript(listenInput({ summary }));
}

export function narrationPrompt(input) {
  const lines = input.points.map((p, i) => `${i + 1}. ${p.text}${p.source ? `\n   Policy says: "${p.source}"` : ""}`).join("\n");
  return [
    "Write a short spoken summary of the terms someone agreed to, to be read aloud to them by a text to speech voice.",
    `Site: ${input.site || "this site"} (say the site's name naturally, for example "CrowdStrike" for crowdstrike.com).`,
    `Overall risk: ${input.risk}.`,
    "What the policy says (use only these facts):",
    lines || "(nothing notable)",
    input.actions.length ? `Suggested next steps: ${input.actions.join("; ")}.` : "",
    "",
    "Rules:",
    "- Talk to the listener as \"you\". Plain, calm words. 60 to 110 words.",
    "- Start with the site and the overall risk. Then the most important points first, using specifics from the policy sentences (who gets the data, amounts, how often). Group related points.",
    "- Mention money terms (fees, renewals, rate changes) if there are any.",
    "- End with the single most useful next step, if one is given.",
    "- Only state what the policy sentences say. No legal advice, no guessing, no numbers that are not in the text.",
    "- No lists, headings, symbols, emoji, or dashes. Write full sentences.",
    'Reply with JSON only: {"narration": "..."}',
  ].filter(Boolean).join("\n");
}

/** Gemini writes the narration; returns null if it fails or comes back unusable (the caller reads the list). */
export async function spokenNarration(llm, input) {
  if (!llm || !input.points.length) return null;
  try {
    const reply = await llm(narrationPrompt(input));
    const m = String(reply).match(/\{[\s\S]*\}/);
    let text = m ? JSON.parse(m[0]).narration : null;
    if (typeof text !== "string") return null;
    text = text.replace(/[*_#`>]/g, "").replace(/\s*[\u2013\u2014]\s*/g, ", ").replace(/\s+/g, " ").trim();
    if (text.length < 40) return null;
    return text.length > MAX_NARRATION ? `${text.slice(0, text.lastIndexOf(".", MAX_NARRATION) + 1) || text.slice(0, MAX_NARRATION)}` : text;
  } catch {
    return null;
  }
}
const MAX_NARRATION = 1100;
