// Gemini API adapter. Returns an `llm(prompt) -> Promise<string>` function for lib/summary.
export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
// Flash-Lite answers in about 1.5 s on the demo terms; gemini-3.8-flash took about 106 s (thinking), too slow for a popup.
export const DEFAULT_MODEL = "gemini-3.5-flash-lite";

/**
 * @param {{ apiKey: string, model?: string, fetchImpl?: typeof fetch, timeoutMs?: number }} cfg
 * @returns {((prompt: string) => Promise<string>) | null} null when no key is set.
 */
export function geminiLlm({ apiKey, model = DEFAULT_MODEL, fetchImpl = fetch, timeoutMs = 30000 }) {
  if (!apiKey) return null;
  const name = String(model || DEFAULT_MODEL).replace(/^models\//, "");
  return async (prompt) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${GEMINI_BASE}/models/${encodeURIComponent(name)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      // Join the text parts of the first candidate, skipping thought summaries.
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const text = parts.filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("");
      if (!text) throw new Error("Gemini returned no text");
      return text;
    } finally {
      clearTimeout(timer);
    }
  };
}
