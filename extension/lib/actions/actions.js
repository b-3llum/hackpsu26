// What to do next: turn a consent receipt's cited claims into concrete actions with drafted requests.
// Plain ESM with no dependencies, so it runs in the MV3 module service worker, the popup, and node tests.

/** Action kinds in display order (most protective first). */
export const ACTION_KINDS = [
  "opt_out_sale", "opt_out_ai_training", "arbitration_opt_out", "cancel_before_renewal", "avoid_overdraft",
  "delete_account", "limit_tracking", "limit_location", "payment_reminder", "keep_minimum_balance",
  "watch_rate", "review_fees", "watch_terms",
];

// category -> action kind. One category maps to one action; several categories can share an action.
const CATEGORY_ACTION = {
  data_sold: "opt_out_sale",
  ai_training: "opt_out_ai_training",
  arbitration: "arbitration_opt_out",
  auto_renewal: "cancel_before_renewal",
  overdraft: "avoid_overdraft",
  retention: "delete_account",
  biometrics: "delete_account",
  tracking: "limit_tracking",
  location: "limit_location",
  late_payment: "payment_reminder",
  minimum_balance: "keep_minimum_balance",
  interest_rate_change: "watch_rate",
  fee: "review_fees",
  terms_change: "watch_terms",
};

// Which policy document a link should point at for each action.
const LINK_TYPE = {
  opt_out_sale: "privacy", opt_out_ai_training: "privacy", delete_account: "privacy", limit_tracking: "cookie",
  limit_location: "privacy", arbitration_opt_out: "terms", cancel_before_renewal: "terms", avoid_overdraft: "terms",
  payment_reminder: "terms", keep_minimum_balance: "terms", watch_rate: "terms", review_fees: "terms", watch_terms: "terms",
};

const TEMPLATES = {
  opt_out_sale: {
    title: "Opt out of the sale or sharing of your data",
    why: "The policy says they can sell or share your personal data.",
    draft: (d) => `Hello ${d} privacy team,\n\nPlease do not sell or share my personal information, and opt me out of any sale, sharing, or targeted advertising use of my data. Please confirm in writing when this is done.\n\nThank you.`,
  },
  opt_out_ai_training: {
    title: "Opt out of AI training on your content",
    why: "The policy says your content can be used to train AI models.",
    draft: (d) => `Hello ${d} privacy team,\n\nPlease exclude my account and all of my content from being used to train or improve artificial intelligence or machine learning models, and confirm the setting or process you used.\n\nThank you.`,
  },
  arbitration_opt_out: {
    title: "Opt out of forced arbitration (check the deadline)",
    why: "The terms say you give up the right to sue in court. Many terms allow an opt out only within a short window, often 30 days after you agree.",
    draft: (d) => `Hello ${d} legal team,\n\nI am writing to opt out of the arbitration agreement and class action waiver in your terms of service. Please confirm that my opt out has been recorded.\n\nThank you.`,
  },
  cancel_before_renewal: {
    title: "Set a reminder to cancel before it renews",
    why: "The terms say it renews and charges you automatically until you cancel.",
    draft: (d) => `Reminder: decide whether to keep ${d}. It renews automatically, so cancel at least 2 days before the renewal date if you do not want to be charged again.`,
  },
  avoid_overdraft: {
    title: "Opt out of overdraft coverage",
    why: "The agreement says you can be charged for overdrawing your account.",
    draft: (d) => `Hello ${d} support,\n\nPlease opt me out of overdraft coverage so that transactions that would overdraw my account are declined instead of charged a fee. Please confirm the change.\n\nThank you.`,
  },
  delete_account: {
    title: "Request deletion of your data",
    why: "The policy says they keep your data for a long time or collect sensitive data.",
    draft: (d) => `Hello ${d} privacy team,\n\nPlease delete my account and all personal information you hold about me, including any biometric data, and confirm when the deletion is complete.\n\nThank you.`,
  },
  limit_tracking: {
    title: "Reject non essential cookies and tracking",
    why: "The policy says they track you with cookies or across sites.",
    draft: null,
  },
  limit_location: {
    title: "Turn off location access",
    why: "The policy says they collect your location.",
    draft: null,
  },
  payment_reminder: {
    title: "Set up autopay or a due date reminder",
    why: "The terms say paying late costs you extra.",
    draft: (d) => `Reminder: pay ${d} before the due date to avoid late fees.`,
  },
  keep_minimum_balance: {
    title: "Set a low balance alert",
    why: "The agreement says you must keep a minimum balance or pay a fee.",
    draft: null,
  },
  watch_rate: {
    title: "Watch for interest rate changes",
    why: "The agreement says your interest rate can change.",
    draft: null,
  },
  review_fees: {
    title: "Ask which fees can be waived",
    why: "The terms say they can charge you fees.",
    draft: (d) => `Hello ${d} support,\n\nCould you list every fee that applies to my account and tell me how each one can be avoided or waived?\n\nThank you.`,
  },
  watch_terms: {
    title: "Keep change alerts on for this site",
    why: "The terms say they can change them, and Consent Receipts will alert you when the text changes.",
    draft: null,
  },
};

function safeLink(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}

function pickLink(policies, want) {
  const ok = (policies || []).map((p) => ({ type: String(p?.type || "").toLowerCase(), url: safeLink(p?.url) })).filter((p) => p.url);
  const match = ok.find((p) => p.type === want) || (want === "cookie" && ok.find((p) => p.type === "privacy")) || ok[0];
  return match?.url;
}

/**
 * @param {{ domain?: string, summary?: { claims?: { category: string, sourceSentence?: string }[] }, policies?: { url: string, type?: string }[] }} receipt
 * @returns {{ kind: string, title: string, why: string, draft: string|null, link?: string, category: string, sourceSentence?: string }[]}
 */
export function suggestActions(receipt) {
  const domain = String(receipt?.domain || "").trim() || "this site";
  const claims = Array.isArray(receipt?.summary?.claims) ? receipt.summary.claims : [];
  const byKind = new Map();
  for (const c of claims) {
    const kind = CATEGORY_ACTION[c?.category];
    if (!kind || byKind.has(kind)) continue; // first cited sentence per action wins
    const t = TEMPLATES[kind];
    const action = { kind, title: t.title, why: t.why, draft: t.draft ? t.draft(domain) : null, category: c.category };
    if (c.sourceSentence) action.sourceSentence = String(c.sourceSentence);
    const link = pickLink(receipt?.policies, LINK_TYPE[kind]);
    if (link) action.link = link;
    byKind.set(kind, action);
  }
  return ACTION_KINDS.filter((k) => byKind.has(k)).map((k) => byKind.get(k));
}
