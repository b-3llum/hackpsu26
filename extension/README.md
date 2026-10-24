# Consent Receipts

**You click "Agree" hundreds of times a year. Consent Receipts keeps a plain words receipt of what you agreed to, shows the exact clause behind every point, and tells you when the deal changes.**

HackPSU Fall 26 project. See the Devpost page for what was built during the event.

## What it does
1. **Captures consent.** Clicking Agree, Accept, Accept all, Allow, or checking an "I agree to the Terms" box saves a receipt: site, page URL, time, button text, banner text, links to the Terms, Privacy, and Cookie policies, and which cookie categories were on or off. Works with generic banners and OneTrust, Cookiebot, TrustArc, and Quantcast, including banners inside iframes. Weak words like "Continue" or "OK" only count inside a consent banner or a sign up form that mentions the terms, so "Continue reading" does not create a receipt.
2. **Writes a cited summary.** It fetches the linked policies and lists what you agreed to in plain words: data sold or shared with third parties, tracking, location, biometrics, retention, arbitration, AI training on your content, and terms that can change. **Every point shows the sentence it came from.** Negations are handled ("we never sell your data" is not flagged).
3. **Finance mode** (on by default) flags fees, interest rate changes, overdraft, late payment, minimum balance, and auto renewal clauses.
4. **Optional Gemini summary.** Add a Gemini API key in Settings. Gemini must cite a numbered sentence for every point; points with no real source are dropped and lower the trust score. Rule based findings always stay, so the AI can add context but cannot hide a flagged clause. Without a key, or if the call fails, the summary is rule based.
5. **Watches for changes.** A scheduled check (daily by default) and **Check now** re-fetch every saved policy once per URL. If a policy changed, you get the added and removed sentences, the risk before and after, a Chrome notification, and a badge count.
6. **Popup.** Receipt cards with a Low, Medium, or High risk badge, expandable points with their sources, change history, JSON export, and a printable receipt.

## Privacy
Everything stays in your browser (`chrome.storage.local`). No accounts, servers, analytics, or external scripts. Network requests: (a) the public policy pages you agreed to, fetched without cookies, and (b) only if you add a key, the Gemini API (`generativelanguage.googleapis.com`), which receives the policy text. Content scripts can only report captures; they cannot read or delete receipts.

## Install
1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select this `extension` folder
4. Pin the Consent Receipts icon
5. Optional: open **Settings**, paste a Gemini API key, click **Save**, then **Re summarize all receipts**

## Offline demo (for judges)
Content scripts do not run on `file://` pages by default, so serve the demo locally:
```
cd extension/demo
python3 -m http.server 8000
```
1. Open `http://localhost:8000/index.html` and click **Accept all**. The popup shows a SnapPix receipt (Medium risk). Expand a point to see the sentence it came from.
2. Open **Settings > Demo tools > Simulate terms change (v1 to v2)**. This repoints the saved Terms link to `terms-v2.html` and runs a check: a notification fires, the badge turns red, and the receipt goes to **High** risk with the new clauses (selling data, location, facial recognition, AI training, arbitration, auto renewal, a late fee).
3. **Simulate stale snapshot** makes the newest receipt's saved text stale, so the next check reports a change on any real site.

## Code layout
| Path | What |
| --- | --- |
| `manifest.json` | MV3, module service worker |
| `background.js` | Capture handling, policy fetches, scheduled checks, notifications |
| `content.js` | Consent click detection (classic script, runs in every frame) |
| `lib/summary/` | `summarize(text, { mode, llm })`: cited claims, risk, trust |
| `lib/finance/` | Finance detectors and the shared sentence splitter |
| `lib/gemini.js` | Gemini `generateContent` adapter used as the `llm` |
| `lib/policy.js` | HTML to text, hashing, sentence diff |
| `lib/settings.js` | Settings defaults |
| `popup/`, `options/` | UI |
| `demo/` | Offline SnapPix demo with terms v1 and v2 |

## Tests
```
cd extension && npm test
```
Runs every `*.test.js` with `node --test` (no dependencies): finance detectors, sentence splitting, cited summaries, the Gemini adapter (mocked), and the full SnapPix demo flow from v1 to v2.

## Limits
Rules are keyword and pattern based, not legal advice: expect some misses and false positives on unusual wording. Policies behind a login or rendered only by JavaScript may not be fetched.
