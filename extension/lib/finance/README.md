# Finance mode detectors (lib/finance)

Rule based detectors that flag money related clauses in terms, agreements, and disclosures. Plain ES modules, no dependencies. Works in a Chrome MV3 extension (import as ES module) and in node (`package.json` sets `"type": "module"`).

## API

### `splitSentences(text) -> string[]` (`sentences.js`)
Splits policy text into sentences. Handles abbreviations (e.g., i.e., U.S., Inc., N.A.), decimals (2.5%), bullet lists, numbered lists, and newlines (each line or bullet starts a new sentence, markers are stripped).

### `detectFinance(policyText) -> [{ category, sentence, sentenceIndex }]` (`detect.js`)
`sentenceIndex` is the index into `splitSentences(policyText)`. One sentence can produce hits in several categories.

Categories (`FINANCE_CATEGORIES`) and plain words labels (`FINANCE_LABELS`):

| category | label |
| --- | --- |
| fee | They can charge you a fee |
| interest_rate_change | Your interest rate can change |
| overdraft | You can be charged for overdrawing your account |
| auto_renewal | It renews and charges you automatically |
| late_payment | Paying late costs you extra |
| minimum_balance | You must keep a minimum balance or pay |

Negation handling skips sentences like "There are no overdraft fees" or "We do not charge a fee", unless the sentence also contains "but", "however", or "except" plus a dollar amount.

## Merging into summarize(policyText, { mode: "finance" })

```js
import { detectFinance, FINANCE_LABELS } from "../finance/detect.js";

const financeClaims = detectFinance(policyText).map((h) => ({
  text: FINANCE_LABELS[h.category],
  category: h.category,
  sourceSentence: h.sentence,
  sourceIndex: h.sentenceIndex,
}));
// claims = [...generalClaims, ...financeClaims]
```
Use `splitSentences` from this module in `lib/summary` too so `sourceIndex` values line up across both modules.

## Tests

```
cd extension && npm test
```
Fixtures in `test/fixtures/`: bank account agreement, streaming subscription ToS, loan disclosure, and a clean policy with no hits.

## Limits
Keyword and regex matching, not legal advice. Expect some false positives and misses on unusual wording.
