# Cited summaries (lib/summary)

Turns policy text into plain words claims, each tied to the exact sentence it came from, plus a Low / Medium / High risk score and a trust score. Plain ES modules, no dependencies.

## API

```js
import { summarize } from "./lib/summary/summarize.js";

const { risk, claims, trust, engine } = await summarize(policyText, { mode: "finance", llm });
// claims: [{ text, category, sourceSentence, sourceIndex, source: "rules" | "ai" }]
```

- `mode`: `"general"` (default) or `"finance"` (adds lib/finance detectors).
- `llm` (optional): any `async (prompt) => replyText` function. The model gets numbered sentences and must cite one per claim. Without it, or if it fails, the summary is rules only.
- `sourceIndex` indexes `splitSentences(policyText)` from lib/finance, so the popup can highlight the source sentence.
- `trust`: 1 for rules only (exact matches). For AI summaries, the share of claims that cited a real sentence (70%) plus the share that rules also flagged on the same sentence (30%). AI claims with an invalid citation are dropped.
- `engine`: `"ai"` if at least one valid AI claim came back, else `"rules"`.

Rule claims are always kept alongside AI claims, so the AI can add context but cannot hide a flagged clause.

## Tests

```
cd extension && npm test
```
