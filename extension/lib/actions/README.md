# lib/actions: what to do next

`suggestActions(receipt)` turns a receipt's cited claims into next steps the popup can render.

```js
import { suggestActions, ACTION_KINDS } from "./lib/actions/actions.js";
suggestActions({
  domain: "example.com",
  summary: { claims: [{ category: "auto_renewal", sourceSentence: "Your plan renews automatically." }] },
  policies: [{ url: "https://example.com/terms", type: "terms" }],
});
// [{ kind: "cancel_before_renewal", title, why, draft, link, category, sourceSentence }]
```

- Categories come from `lib/summary` (`data_sold`, `tracking`, `location`, `biometrics`, `retention`, `arbitration`, `ai_training`, `terms_change`) and `lib/finance` (`fee`, `interest_rate_change`, `overdraft`, `auto_renewal`, `late_payment`, `minimum_balance`). Unknown categories are ignored.
- One action per kind, in `ACTION_KINDS` order (most protective first). The first cited sentence for a kind is kept as `sourceSentence` so the popup can show why.
- `draft` is a ready to copy request or reminder, or `null` when the step is a setting the user changes themselves.
- `link` is the best matching policy URL (privacy, cookie, or terms), only `http(s)`, omitted when none is safe.
- No network calls and no dependencies. Tests: `node --test extension/lib/actions/test/`.
