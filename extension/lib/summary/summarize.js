import { splitSentences } from "../finance/sentences.js";
import { detectFinance, FINANCE_LABELS } from "../finance/detect.js";

export const GENERAL_LABELS = {
  data_sold: "They can sell or share your data",
  tracking: "They track you across sites or apps",
  location: "They collect your location",
  biometrics: "They collect biometric data (face, voice, fingerprint)",
  retention: "They keep your data for a long time",
  arbitration: "You give up the right to sue in court",
  ai_training: "Your content can be used to train AI",
  terms_change: "They can change these terms",
};

const GENERAL_RULES = {
  // Selling always counts; sharing only with outside parties, not with "service providers" who run the service.
  data_sold: /\b(sell|sold|sale of|rent)\w*\b[^.]{0,60}\b(data|information)\b|\b(share|disclose)\w*\b[^.]{0,60}\b(third[- ]part(y|ies)|advertis\w*|marketing partners|business partners|data brokers)\b/i,
  tracking: /\b(cookies?|pixels?|web beacons?|tracking technolog\w*|track\w*\b[^.]{0,30}\b(across|activity)|cross[- ](site|device)|targeted advertising)\b/i,
  location: /\b(precise |approximate |geo)?location (data|information)\b|\b(your|precise|approximate|real[- ]time) location\b|\bgeolocation\b|\bGPS\b/i,
  biometrics: /\b(biometric\w*|face ?prints?|facial (recognition|geometry)|voice ?prints?|fingerprints?)\b/i,
  retention: /\b(retain|keep|store)\w*\b[^.]{0,60}\b(as long as|indefinitely|after you (close|delete)|for \d+ (years?|months?))\b/i,
  arbitration: /\b(binding arbitration|arbitrat\w+|class action waiver|waive\w*\b[^.]{0,30}\b(jury|class action))\b/i,
  ai_training: /\b(train\w*|improve)\b[^.]{0,40}\b(artificial intelligence|AI|machine learning|models?)\b/i,
  terms_change: /\b(change|modify|update|amend|revise)\w*\b[^.]{0,40}\b(these terms|this (policy|agreement)|terms of (service|use))\b|\bat any time\b[^.]{0,40}\b(without notice)\b/i,
};

// Categories that push risk up the most when present.
const HIGH = new Set(["data_sold", "biometrics", "arbitration", "ai_training", "overdraft", "interest_rate_change"]);
const MEDIUM = new Set(["tracking", "location", "retention", "auto_renewal", "fee", "late_payment", "minimum_balance"]);

// "We never sell your data", "we do not use your content to train AI".
const NEGATED_ACTION = /\b(never|not|no|don't|won't|doesn't)\b[^.,;]{0,20}\b(sell|rent|share|disclose|track|collect|use|train|retain|keep|store)\w*/i;
const NEGATABLE = new Set(["data_sold", "tracking", "location", "biometrics", "ai_training", "retention"]);

function ruleClaims(sentences) {
  const claims = [];
  sentences.forEach((sentence, i) => {
    for (const [category, re] of Object.entries(GENERAL_RULES)) {
      if (NEGATABLE.has(category) && NEGATED_ACTION.test(sentence)) continue;
      if (re.test(sentence)) claims.push({ text: GENERAL_LABELS[category], category, sourceSentence: sentence, sourceIndex: i });
    }
  });
  return claims;
}

function financeClaims(policyText) {
  return detectFinance(policyText).map((h) => ({
    text: FINANCE_LABELS[h.category],
    category: h.category,
    sourceSentence: h.sentence,
    sourceIndex: h.sentenceIndex,
  }));
}

export function scoreRisk(claims) {
  const cats = new Set(claims.map((c) => c.category));
  const high = [...cats].filter((c) => HIGH.has(c)).length;
  const medium = [...cats].filter((c) => MEDIUM.has(c)).length;
  if (high >= 2 || (high >= 1 && medium >= 2)) return "high";
  if (high >= 1 || medium >= 2) return "medium";
  return "low";
}

function buildPrompt(sentences, mode) {
  const numbered = sentences.map((s, i) => `[${i}] ${s}`).join("\n");
  return [
    "You summarize terms of service and privacy or financial policies for a regular person.",
    `List the points that matter most to the user${mode === "finance" ? ", especially fees, rate changes, overdraft, auto renewal, and penalties" : ""}.`,
    "Every point must cite exactly one numbered sentence below that directly supports it. Do not make claims the text does not state.",
    'Reply with JSON only: {"claims":[{"text":"plain words point, under 15 words","category":"short_snake_case","sourceIndex":0}]}',
    "",
    numbered,
  ].join("\n");
}

function parseJson(reply) {
  const m = String(reply).match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}

// Keep only AI claims that cite a real sentence. Returns [kept, droppedCount].
function verifyClaims(raw, sentences) {
  const kept = [];
  let dropped = 0;
  for (const c of Array.isArray(raw) ? raw : []) {
    const i = Number(c?.sourceIndex);
    if (!Number.isInteger(i) || i < 0 || i >= sentences.length || typeof c.text !== "string" || !c.text.trim()) {
      dropped++;
      continue;
    }
    kept.push({ text: c.text.trim(), category: String(c.category || "other"), sourceSentence: sentences[i], sourceIndex: i, source: "ai" });
  }
  return [kept, dropped];
}

/**
 * Summarize a policy into cited claims.
 * @param {string} policyText
 * @param {{ mode?: "general"|"finance", llm?: (prompt: string) => Promise<string> }} [opts]
 *   llm is any function that sends a prompt to a model and returns its text reply. Without it, rules only.
 * @returns {Promise<{ risk: "low"|"medium"|"high", claims: {text:string, category:string, sourceSentence:string, sourceIndex:number, source:"rules"|"ai"}[], trust: number, engine: "rules"|"ai" }>}
 */
export async function summarize(policyText, opts = {}) {
  const mode = opts.mode === "finance" ? "finance" : "general";
  const sentences = splitSentences(policyText);
  const rules = [...ruleClaims(sentences), ...(mode === "finance" ? financeClaims(policyText) : [])].map((c) => ({ ...c, source: "rules" }));

  let claims = rules;
  let trust = 1; // Rule claims are exact matches on the source sentence.
  let engine = "rules";

  if (opts.llm && sentences.length) {
    try {
      const parsed = parseJson(await opts.llm(buildPrompt(sentences, mode)));
      const [ai, dropped] = verifyClaims(parsed?.claims, sentences);
      if (ai.length) {
        // Trust: share of AI claims that cited a real sentence, plus credit when rules agree on the same sentence.
        const corroborated = ai.filter((c) => rules.some((r) => r.sourceIndex === c.sourceIndex)).length;
        const valid = ai.length / (ai.length + dropped);
        trust = Math.round((0.7 * valid + 0.3 * (corroborated / ai.length)) * 100) / 100;
        // Rules always stay in: they are what the AI is checked against.
        const covered = new Set(ai.map((c) => `${c.sourceIndex}:${c.category}`));
        claims = [...ai, ...rules.filter((r) => !covered.has(`${r.sourceIndex}:${r.category}`))];
        engine = "ai";
      }
    } catch {
      // Network, key, or JSON problems fall back to rules.
    }
  }

  claims.sort((a, b) => a.sourceIndex - b.sourceIndex);
  return { risk: scoreRisk(claims), claims, trust, engine };
}
