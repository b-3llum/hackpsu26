// ElevenLabs text to speech for "Listen to this receipt". The key stays on the server.
export const ELEVEN_BASE = "https://api.elevenlabs.io/v1";
export const DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb";
export const DEFAULT_TTS_MODEL = "eleven_flash_v2_5";
const MAX_SCRIPT = 1200;

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

/**
 * What gets read aloud: the risk and each distinct point, built on the server from the summary.
 * The site name is left out on purpose, so the speech provider never learns which sites you use.
 */
export function receiptScript(summary) {
  const risk = RISK_WORDS[String(summary?.risk).toLowerCase()] || "unknown";
  const points = [...new Set((Array.isArray(summary?.claims) ? summary.claims : [])
    .map((c) => String(c?.text || "").replace(/\s+/g, " ").trim())
    .filter(Boolean))]
    .map((t) => (/[.!?]$/.test(t) ? t : `${t}.`));
  let script = `Here is your consent receipt. Overall risk: ${risk}.`;
  script += points.length ? " What you agreed to:" : " Nothing notable was found.";
  for (const p of points) {
    if (script.length + p.length + 1 > MAX_SCRIPT) { script += " And more points in the receipt."; break; }
    script += ` ${p}`;
  }
  return script;
}
