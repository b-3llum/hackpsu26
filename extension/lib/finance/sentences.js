// Sentence splitter tuned for legal and financial policy text.
const ABBREVIATIONS = [
  "e.g", "i.e", "etc", "vs", "inc", "ltd", "co", "corp", "llc", "no", "mr", "mrs", "ms", "dr",
  "jr", "sr", "st", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
  "u.s", "u.k", "u.s.a", "a.m", "p.m", "approx", "dept", "est", "fig", "sec", "art", "para", "max", "min",
];
const ABBR = new Set(ABBREVIATIONS);

function endsWithAbbreviation(chunk) {
  const m = chunk.match(/([A-Za-z][A-Za-z.]*)\.$/);
  if (!m) return false;
  const word = m[1].toLowerCase();
  if (ABBR.has(word)) return true;
  // Single letter initials like "J." or dotted acronyms like "U.S."
  if (/^[a-z]$/.test(word)) return true;
  if (/^([a-z]\.)+[a-z]$/.test(word)) return true;
  return false;
}

/**
 * Split text into sentences. Newlines and bullet items always start a new sentence.
 * @param {string} text
 * @returns {string[]}
 */
export function splitSentences(text) {
  if (typeof text !== "string" || !text.trim()) return [];
  const out = [];
  const lines = text.replace(/\r\n?/g, "\n").split(/\n+/);
  for (let line of lines) {
    line = line.replace(/^\s*(?:[-*\u2022\u25CF\u25AA]|\(?\d{1,3}[.)]|\(?[a-zA-Z][.)])\s+/, "").trim();
    if (!line) continue;
    let start = 0;
    const re = /[.!?]+["')\]]*(?=\s+|$)/g;
    let m;
    while ((m = re.exec(line))) {
      const end = m.index + m[0].length;
      const chunk = line.slice(start, end).trim();
      const next = line.slice(end).trimStart();
      if (m[0].startsWith(".") && m[0].length === 1 && endsWithAbbreviation(chunk) && next && !/^[A-Z]{2,}\b/.test(next)) {
        // Abbreviation: only break if next word looks like a new sentence after a non common abbreviation.
        const w = chunk.match(/([A-Za-z.]+)\.$/)[1].toLowerCase();
        if (!(w === "etc" && /^[A-Z]/.test(next))) continue;
      }
      if (chunk) out.push(chunk);
      start = end;
    }
    const rest = line.slice(start).trim();
    if (rest) out.push(rest);
  }
  return out;
}
