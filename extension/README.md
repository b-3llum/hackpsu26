# 🧾 Consent Receipts

**You click "Agree" hundreds of times a year. Consent Receipts keeps a plain-words receipt of what you gave away, and tells you when the deal changes.**

Built at HackPSU Fall 26.

## What it does
1. **Captures consent.** When you click Agree, Accept, Accept all, Allow, I agree, Sign up, or check a "I agree to the Terms" box, the extension saves: site, page URL, time, button text, nearby banner text, links to Terms / Privacy / Cookie policies, and which cookie categories were on or off. It works with generic banners and common CMPs (OneTrust, Cookiebot, TrustArc, Quantcast).
2. **Writes a receipt in plain words.** It fetches the linked policies, stores a trimmed text snapshot plus a SHA-256 hash, and lists "You agreed to: ..." items such as data sold or shared, ad tracking, location, contacts, biometrics, retention period, arbitration and class action waiver, auto-renewal, AI training on your content, children, and terms that can change without notice. "Good news" items (like account deletion rights) are shown too. Each receipt gets a **Low / Medium / High** risk badge with the top reasons.
3. **Watches for changes.** A daily alarm (configurable) and a **Check now** button re-fetch every saved policy. If the hash changed, it diffs the sentences (added and removed), re-summarizes, shows a Chrome notification "Terms changed on example.com", and adds a badge count. Every receipt keeps its change history with the risk before and after.
4. **Popup.** Receipt-style cards, click to expand, export JSON, export a printable HTML receipt, delete a receipt.
5. **Options.** Auto-capture toggle, check frequency, optional AI key / base URL / model, clear all data, demo tools.

## Privacy
Everything stays in your browser (`chrome.storage.local`). No accounts, no servers, no analytics, no external CDNs. The only network requests are (a) fetching the public policy pages you agreed to, and (b) **only if you add one**, a call to the OpenAI-compatible AI endpoint you configured. Without a key, the summary is made by a local rule-based engine.

## Install
1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select the `consent-receipts` folder
4. Pin the 🧾 icon

## Offline demo (for judges)
Content scripts do not run on `file://` pages by default, so serve the demo locally:
```
cd consent-receipts/demo
python3 -m http.server 8000
```
Open `http://localhost:8000/index.html`, click **Accept all** on the cookie banner. Open the popup: a SnapPix receipt appears (Medium risk).

To simulate a terms change: open the extension **Settings > Demo tools > Simulate terms change (v1 to v2)**. This repoints the saved Terms link from `terms-v1.html` to `terms-v2.html` and runs a check. You get a notification, a red badge, and the receipt now shows High risk with the new sentences (selling data, facial recognition, AI training, arbitration). "Simulate stale snapshot" works on any real site too.

## 3 minute pitch script
- **0:00 Hook.** "Raise your hand if you read the last Terms you agreed to. Nobody does. And companies change them after you click."
- **0:30 Capture.** Open SnapPix demo, click Accept all. Open popup: a receipt with what you gave away, in plain words, with a risk badge.
- **1:15 Change alert.** Click Simulate terms change. Notification pops: "Terms changed on localhost". Expand: green lines are new clauses, risk went Medium to High, with reasons like "Your content may be used to train AI".
- **2:00 Trust.** Everything is local. AI is optional and bring your own key, with a rule-based fallback, so you can trust the tool that tells you what to trust.
- **2:30 Impact.** Same idea for banks, health portals, schools, and employers: a consent audit trail for people and for compliance teams. Close with export to printable receipt.

## HackPSU tracks
- **FNB Challenge: Trust, Decisions and Finance.** Helps people decide what to trust and what to do next when a financial or data deal changes.
- **Grand Prize.** Working product, live demo, everyday problem.
- **Nittany AI Challenge.** Meaningful, optional AI summaries with strict JSON output and a safe fallback.

## Next steps
- Shared, anonymized "terms changed" feed so one user's check helps everyone
- One-click actions: delete account link, opt-out email drafts, cancel subscription
- Compare a site's terms against a sector baseline (banks vs fintech apps)
- Firefox and Safari ports, mobile companion
- Team mode for compliance officers tracking vendor terms

## Files
`manifest.json`, `background.js` (service worker), `content.js`, `lib/summarize.js` (rules, diff, HTML to text, also runs in Node), `popup/`, `options/`, `demo/`, `icons/`.
