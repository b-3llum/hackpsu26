// Policy page helpers: HTML to text, hashing, and sentence level diffs.
import { splitSentences } from "./finance/sentences.js";

const ENTITIES = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&#39;": "'", "&apos;": "'", "&quot;": '"' };

/**
 * Turn a policy page into plain text, one block element per line so splitSentences keeps sentences apart.
 * @param {string} html
 */
export function htmlToText(html) {
  let h = String(html || "");
  const main = h.match(/<(main|article)\b[\s\S]*<\/\1>/i);
  if (main) h = main[0];
  return h
    .replace(/<(script|style|noscript|nav|header|footer|svg|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr|section|dd|dt)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(nbsp|amp|lt|gt|#39|apos|quot);/g, (m) => ENTITIES[m])
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * Sentences added and removed between two versions of a policy.
 * @returns {{ added: string[], removed: string[] }}
 */
export function diffSentences(oldText, newText, limit = 30) {
  const a = new Set(splitSentences(oldText));
  const b = new Set(splitSentences(newText));
  return {
    added: [...b].filter((s) => !a.has(s)).slice(0, limit),
    removed: [...a].filter((s) => !b.has(s)).slice(0, limit),
  };
}
