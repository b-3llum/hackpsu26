// Sentence splitter tuned for legal and financial policy text.
const ABBREVIATIONS = [
  "e.g", "i.e", "etc", "vs", "inc", "ltd", "co", "corp", "llc", "no", "mr", "mrs", "ms", "dr",
  "jr", "sr", "st", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
  "u.s", "u.k", "u.s.a", "a.m", "p.m", "approx", "dept", "est", "fig", "sec", "art", "para", "max", "min",
];
const ABBR = new Set(ABBREVIATIONS);
// After a dotted acronym like "U.S." these words almost always start a new sentence.
const SENTENCE_STARTERS = new Set([
  "We", "You", "Your", "If", "The", "This", "These", "Our", "Any", "All", "Each", "It", "They", "There",
  "When", "In", "For", "A", "An", "Please", "No", "Unless", "Fees", "Interest",
]);
const BULLET = /^\s*(?:[-*\u2022\u25CF\u25AA]|\(?\d{1,3}[.)]|\(?[a-zA-Z][.)])\s+/;
// Words a hard wrapped line can end on mid sentence.
const DANGLING = /(?:,|\b(?:a|an|the|of|to|and|or|for|in|on|at|by|with|your|our|any|per|is|are|be|may|will|monthly|annual))$/i;

// Join hard wrapped lines (policies scraped as plain text often wrap at 80 columns). A newline stays a break
// when the line ends with sentence punctuation or the next line is a bullet; otherwise the lines are joined
// when the next line starts lowercase, with a digit or "$", or the line ends on a dangling word.
function unwrap(lines) {
  const out = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const prev = out.length ? out[out.length - 1] : null;
    const join = prev !== null && !/[.!?:;]["')\]]*$/.test(prev) && !BULLET.test(raw)
      && (/^[a-z0-9$(]/.test(line) || DANGLING.test(prev));
    if (join) out[out.length - 1] = `${prev} ${line}`;
    else out.push(line);
  }
  return out;
}

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
  const lines = unwrap(text.replace(/\r\n?/g, "\n").split(/\n+/));
  for (let line of lines) {
    line = line.replace(BULLET, "").trim();
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
        const nextWord = (next.match(/^[A-Za-z]+/) || [""])[0];
        const acronymEnd = /^([a-z]\.)+[a-z]$/.test(w) && SENTENCE_STARTERS.has(nextWord);
        if (!((w === "etc" && /^[A-Z]/.test(next)) || acronymEnd)) continue;
      }
      if (chunk) out.push(chunk);
      start = end;
    }
    const rest = line.slice(start).trim();
    if (rest) out.push(rest);
  }
  return out;
}
