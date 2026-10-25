# Consent Receipts

**You click "Agree" hundreds of times a year. Consent Receipts keeps a plain words receipt of what you agreed to, shows the exact clause behind every point, and tells you when the deal changes.**

Prior work: Nafiz built an early prototype of the consent receipt and policy change alert features before HackPSU Fall 26 (HackPSU organizers confirmed importing it is allowed). Everything added during the hackathon (finance mode, cited AI summaries and trust per claim, what to do next actions, and the module refactor) is built in this repo after hacking started and is listed on the Devpost page.

## What it does
1. **Captures consent.** Clicking Agree, Accept, Accept all, Allow, or checking an "I agree to the Terms" box saves a receipt: site, page URL, time, button text, banner text, links to the Terms, Privacy, and Cookie policies, and which cookie categories were on or off. Works with generic banners and OneTrust, Cookiebot, TrustArc, and Quantcast, including banners inside iframes. Weak words like "Continue" or "OK" only count inside a consent banner or a sign up form that mentions the terms, so "Continue reading" does not create a receipt.
2. **Writes a cited summary.** It fetches the linked policies and lists what you agreed to in plain words: data sold or shared with third parties, tracking, location, biometrics, retention, arbitration, AI training on your content, and terms that can change. **Every point shows the sentence it came from.** Negations are handled ("we never sell your data" is not flagged).
3. **Finance mode** (on by default) flags fees, interest rate changes, overdraft, late payment, minimum balance, and auto renewal clauses.
4. **Pro: Gemini summaries.** Sign in (Settings > Sign in, or Connect the extension on https://whatyousignupfor.us/account) and upgrade to Pro. Our server asks Gemini for the summary; Gemini must cite a numbered sentence for every point, points with no real source are dropped and lower the trust score, and rule based findings always stay, so the AI can add context but cannot hide a flagged clause. Receipts appear instantly with the rule based summary and switch to Gemini a moment later. The extension never holds an AI key.
5. **Listen.** Signed in users can play a receipt aloud (ElevenLabs, through our server): 3 a day on Free, unlimited on Pro.
5. **Watches for changes.** A scheduled check (daily by default) and **Check now** re-fetch every saved policy once per URL. If a policy changed, you get the added and removed sentences, the risk before and after, a Chrome notification, and a badge count.
7. **What to do next.** Each receipt suggests concrete steps for what it found (opt out of data sale or AI training, opt out of arbitration, cancel before renewal, opt out of overdraft, request deletion, and more), each with the cited sentence, a drafted request you can copy, and a link to the policy.
8. **Popup.** Receipt cards with a Low, Medium, or High risk badge, expandable points with their sources, change history, JSON export, and a printable receipt.

## Privacy
Receipts stay in your browser (`chrome.storage.local`). No analytics or external scripts. Network requests: (a) the public policy pages you agreed to, fetched without cookies; and only if you sign in: (b) Pro summaries and Listen through https://whatyousignupfor.us (policy text or summary text, never your receipts), and (c) anonymous change reports to the public tracker (policy address without query string, text hash, risk; never for local or demo pages). Content scripts can only report captures; only our website can hand the extension an account token. Full details: https://whatyousignupfor.us/legal/privacy

## Install
1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select this `extension` folder
4. Pin the Consent Receipts icon
5. Optional: open **Settings > Sign in or create an account**, then **Connect the extension** on the account page

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
| `lib/actions/` | `suggestActions(receipt)`: what to do next, with drafted requests |
| `lib/account.js` | Signed in account, Pro summaries, Listen, change reports (all through the server) |
| `lib/gemini.js` | Gemini `generateContent` adapter (used by the server) |
| `lib/policy.js` | HTML to text, hashing, sentence diff |
| `lib/settings.js` | Settings defaults and the site URL |
| `popup/`, `options/` | UI |
| `demo/` | Offline SnapPix demo with terms v1 and v2 |

## Tests
```
cd extension && npm test
```
Runs every `*.test.js` with `node --test` (no dependencies): finance detectors, sentence splitting, cited summaries, the Gemini adapter (mocked), and the full SnapPix demo flow from v1 to v2.

## Limits
Rules are keyword and pattern based, not legal advice: expect some misses and false positives on unusual wording. Policies behind a login or rendered only by JavaScript may not be fetched.
