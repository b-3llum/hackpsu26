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
  overdraft: /\b(overdraft|overdrawn|overdraw|non[- ]sufficient funds|insufficient funds|NSF)\b/i,
  late_payment: /\b(late (payment|fee|charge)s?|(payment|paid|pay) (is |are )?(late|past due|after the due date)|past[- ]due|delinquen\w*)\b/i,
  minimum_balance: /\b(minimum (daily |average |monthly )?balance|maintain a balance|balance (falls|drops) below)\b/i,
  auto_renewal: /\b(auto(matically)?[- ]?renew\w*|renews? automatically|recurring (charge|billing|payment)s?|until (you )?cancel\w*|continuous subscription)\b/i,
  interest_rate_change: /\b((interest rate|APR|annual percentage rate|rate)s?\b[^.]{0,80}\b(change|vary|varies|variable|increase|adjust|rise|fluctuat)\w*|variable[- ]rate|(change|increase|adjust)\w*\b[^.]{0,40}\b(interest rate|APR))/i,
  fee: /\b(fees?|service charges?|surcharges?|penalt(y|ies)|charge (you|a)\b|\$\s?\d)/i,
};

// Negations that cancel a hit, e.g. "no overdraft fees", "we do not charge".
const NEGATION = /\b(no|not|never|without|free of|waive[ds]?|zero|none)\b[^.]{0,30}\b(fees?|charges?|overdraft|penalt\w*|renew\w*|minimum balance|late)\b|\b(does|do|will|shall) not (charge|renew|apply|impose)\b|\bfee[- ]free\b|\bno[- ]fee\b/i;

function isNegated(sentence, category) {
  if (!NEGATION.test(sentence)) return false;
  // If the sentence still has an un negated money amount for a fee, keep it (e.g. "no fee for X, but $5 for Y").
  if (/\bbut\b|\bhowever\b|\bexcept\b/i.test(sentence) && /\$\s?\d/.test(sentence)) return false;
  return true;
}

/**
 * Detect finance relevant clauses.
 * @param {string} policyText
 * @returns {{category:string, sentence:string, sentenceIndex:number}[]}
 */
export function detectFinance(policyText) {
  const sentences = splitSentences(policyText);
  const hits = [];
  sentences.forEach((sentence, sentenceIndex) => {
    for (const category of FINANCE_CATEGORIES) {
      const re = RULES[category];
      if (!re.test(sentence)) continue;
      if (isNegated(sentence, category)) continue;
      // Avoid double counting: a sentence only about overdraft/late/minimum fees is not also a generic fee
      // unless it states an amount.
      if (category === "fee" && hits.some((h) => h.sentenceIndex === sentenceIndex) && !/\$\s?\d/.test(sentence)) continue;
      hits.push({ category, sentence, sentenceIndex });
    }
  });
  return hits;
}
