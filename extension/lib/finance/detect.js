import { splitSentences } from "./sentences.js";

export const FINANCE_CATEGORIES = [
  "fee", "interest_rate_change", "overdraft", "auto_renewal", "late_payment", "minimum_balance",
];

export const FINANCE_LABELS = {
  fee: "They can charge you a fee",
  interest_rate_change: "Your interest rate can change",
  overdraft: "You can be charged for overdrawing your account",
  auto_renewal: "It renews and charges you automatically",
  late_payment: "Paying late costs you extra",
  minimum_balance: "You must keep a minimum balance or pay",
};

const RULES = {
  // "insufficient funds" or "NSF" alone is often just a failed payment (Netflix: "due to expiration, insufficient
  // funds, or otherwise ... we may suspend your access"); it counts only next to a charge word or a dollar amount.
  overdraft: /\b(overdraft|overdrawn|overdraw)\w*\b|\b(non[- ]sufficient funds|insufficient funds|NSF)\b(?=[^.]*(\b(fees?|charges?|charged)\b|\$\s?\d))|\b(fees?|charges?|charged)\b[^.]*\b(non[- ]sufficient funds|insufficient funds|NSF)\b/i,
  late_payment: /\b(late (payment|fee|charge)s?|(payment|paid|pay) (is |are )?(late|past due|after the due date)|past[- ]due|delinquen\w*)\b/i,
  minimum_balance: /\b(minimum (daily |average |monthly )?balance|maintain a balance|balance (falls|drops) below)\b/i,
  auto_renewal: /\b(auto(matically)?[- ]?renew\w*|renews? automatically|recurring (charge|billing|payment)s?|until (you )?cancel\w*|continuous subscription)\b/i,
  interest_rate_change: /\b((interest rate|APR|annual percentage rate|rate)s?\b[^.]{0,80}\b(change|vary|varies|variable|increase|adjust|rise|fluctuat)\w*|variable[- ]rate|(change|increase|adjust)\w*\b[^.]{0,40}\b(interest rate|APR))/i,
  // `\$\s?\d` sits outside the `\b(...)` group: `\b` before `$` needs a word character, so " $35" never matched.
  // Trailing `\b` so "feedback" is not a fee (DuckDuckGo: "to provide feedback").
  fee: /\b(fees?|service charges?|surcharges?|penalt(y|ies)|charged|charges? (you|a|an)|costs?)\b|\$\s?\d/i,
};

// Nouns that a negation must point at to cancel a given category, so "no fees" does not also cancel an
// interest rate clause in the same sentence.
const NEGATED_NOUN = {
  fee: "fees?|charges?|penalt\\w*|costs?|surcharges?",
  overdraft: "overdraft\\w*|overdraw\\w*|insufficient funds|non[- ]sufficient funds|NSF",
  late_payment: "late\\b(?! than)",
  minimum_balance: "minimum (?:daily |average |monthly )?balance",
  auto_renewal: "renew\\w*|recurring",
  interest_rate_change: "rate changes?|changes? (?:to|in) (?:the |your )?(?:interest )?rate|variable rate",
};
// "waived" only cancels a fee: "the fee is waived if you keep a minimum balance" is still a balance rule.
const NEG_WORD = "\\b(?:no|not|never|without|free of|zero|none)\\b";
const FEE_NEG_WORD = "\\b(?:no|not|never|without|free of|waive[ds]?|zero|none)\\b";
const NEG_RE = Object.fromEntries(Object.entries(NEGATED_NOUN).map(([k, nouns]) =>
  [k, new RegExp(`${k === "fee" ? FEE_NEG_WORD : NEG_WORD}[^.]{0,30}?\\b(?:${nouns})`, "i")]));
const GENERIC_NEG = /\b(?:does|do|will|shall|would) not (?:charge|renew|apply|impose)\b|\bfee[- ]free\b|\bno[- ]fee\b/i;
const MONEY = /\$\s?\d/;
// "no later than" / "not later than" is a deadline, not a negation.
const DEADLINE = /\b(?:no|not) later than\b/gi;
// Clause boundaries: one negated clause must not cancel the whole sentence.
const CLAUSE_SPLIT = /[,;:]|\b(?:and|but|however|except|while|whereas)\b/i;

function clauseNegated(clause, category) {
  const m = NEG_RE[category].exec(clause) || GENERIC_NEG.exec(clause);
  if (!m) return false;
  // "no fee for the first transfer then $3 each": a money amount after the negated part keeps a fee hit.
  if (category === "fee" && MONEY.test(clause.slice(m.index + m[0].length))) return false;
  return true;
}

function isNegated(sentence, category) {
  const text = sentence.replace(DEADLINE, "by");
  const rule = RULES[category];
  let clauses = text.split(CLAUSE_SPLIT).map((c) => c.trim()).filter(Boolean).filter((c) => rule.test(c));
  // The rule matched across a clause boundary, so judge the sentence as a whole.
  if (!clauses.length) clauses = [text];
  return clauses.every((c) => clauseNegated(c, category));
}

// `fee` is checked last so the dedup below can see the other categories already found in the sentence.
const CHECK_ORDER = [...FINANCE_CATEGORIES.filter((c) => c !== "fee"), "fee"];

/**
 * Detect finance relevant clauses.
 * @param {string} policyText
 * @returns {{category:string, sentence:string, sentenceIndex:number}[]}
 */
export function detectFinance(policyText) {
  const sentences = splitSentences(policyText);
  const hits = [];
  sentences.forEach((sentence, sentenceIndex) => {
    for (const category of CHECK_ORDER) {
      const re = RULES[category];
      if (!re.test(sentence)) continue;
      if (isNegated(sentence, category)) continue;
      // Avoid double counting: a sentence only about overdraft/late/minimum fees is not also a generic fee
      // unless it states an amount.
      if (category === "fee" && hits.some((h) => h.sentenceIndex === sentenceIndex) && !MONEY.test(sentence)) continue;
      hits.push({ category, sentence, sentenceIndex });
    }
  });
  // Report in sentence order, then in FINANCE_CATEGORIES order within a sentence.
  return hits.sort((a, b) => a.sentenceIndex - b.sentenceIndex
    || FINANCE_CATEGORIES.indexOf(a.category) - FINANCE_CATEGORIES.indexOf(b.category));
}
