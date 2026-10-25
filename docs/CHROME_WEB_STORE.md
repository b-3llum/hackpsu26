# Chrome Web Store submission

Everything needed to publish Consent Receipts. Copy each field into the [Developer Dashboard](https://chrome.google.com/webstore/devconsole).

## 0. One time setup (owner)

1. Sign in to the Developer Dashboard with the Google account that will own the listing. Turn on 2 step verification for that account first.
2. Pay the one time $5 registration fee and verify the contact email.

## 1. Build the package

```
cd extension && npm run build:store
```

This writes `dist/consent-receipts-<version>.zip` (about 32 KB, 18 files). The build drops the manifest `key` (the store assigns its own ID), leaves out tests, the offline demo, docs, and server only code, checks that every import resolves, and enforces the store's name (75) and description (132) limits. It was tested in Chrome: the full SnapPix demo (Accept all, Medium; terms change, High; next actions; Copy draft) works from the store build.

Upload it: Dashboard > **Add new item** > choose the zip.

## 2. Store listing tab

| Field | Value |
| --- | --- |
| Name (from manifest) | Consent Receipts |
| Summary (from manifest, 132 max) | Keeps a plain words receipt when you click Agree, cites the clause behind each risk, and alerts you when the terms change. |
| Category | Privacy & Security if offered, otherwise Tools |
| Language | English (United States) |
| Store icon (128x128) | `server/public/logo.png` resized, or `extension/icons/icon128.png` |
| Screenshots (1280x800) | `docs/store/screenshot-01-receipt.png` to `screenshot-05-changes.png`, in order |
| Small promo tile (440x280) | `docs/store/promo-small-440x280.png` |
| Marquee promo tile (1400x560, optional) | `docs/store/promo-marquee-1400x560.png` |
| Official URL / Homepage | https://whatyousignupfor.us |
| Support URL | https://github.com/b-3llum/hackpsu26/issues |

**Description:**

```
You click Agree hundreds of times a year. Consent Receipts keeps a plain words receipt of what you agreed to, shows the exact sentence behind every risk, and tells you when the deal changes.

What it does
- Saves a receipt when you click Agree, Accept all, Allow, tick an "I agree" box, or close a cookie notice: the site, the time, the button, the policy links, and your cookie choices.
- Reads the linked terms and privacy policy and lists what you agreed to in plain words, with a Low, Medium, or High risk score: data sold or shared, tracking, location, biometrics, data retention, forced arbitration, AI training on your content, and terms that can change.
- Every point opens to the exact policy sentence it came from, so you can check it instead of trusting it.
- Finance mode flags fees, late payments, interest rate changes, overdraft, minimum balances, and auto renewals in bank, loan, and subscription terms.
- What to do next: opt out of data sale or AI training, opt out of arbitration, cancel before a renewal, or request deletion, each with a drafted request you can copy.
- Rechecks saved policies daily or on demand and alerts you when one changes, with the sentences added and removed and the risk before and after.
- Export receipts as JSON or a printable receipt.

Free and private by default
Receipts and the rule based summaries stay in your browser. No account needed.

Optional account (https://whatyousignupfor.us)
- A free account turns on Pro: AI summaries (Google Gemini) that must cite a policy sentence for every point, with a trust score. Rule based findings always stay, so the AI cannot hide a flagged clause.
- Listen: hear a receipt read aloud (ElevenLabs).
- A public tracker of which policies changed this week, built from anonymous change reports.

Not legal advice. Summaries can miss things; the cited sentence and the full policy are always one click away.
```

## 3. Privacy practices tab

**Single purpose:**

```
Keep a record of the terms and privacy policies you agree to on websites, explain them in plain words with the source sentence for each point, and alert you when they change.
```

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `storage` | Saves your receipts, settings, and (if you sign in) your account token locally in the browser. |
| `alarms` | Schedules the daily recheck of saved policies so you can be alerted when one changes. |
| `notifications` | Shows an alert when a saved policy changes, with the new risk level. |
| Host permission `<all_urls>` | Consent banners and policies are on every kind of site. The extension fetches the terms and privacy pages linked from the banner you agreed to (any domain) to summarize them and recheck them for changes. Fetches are made without cookies. |
| Content script on all URLs, all frames | Detects consent clicks (Agree, Accept all, Allow, closing a cookie notice) on any site, including cookie banners shown inside iframes. It reads only the clicked button, the banner text, the policy links, and the cookie category toggles. |

**Remote code:** No, I am not using remote code. (All JavaScript is in the package. The server returns JSON and audio only.)

**Data usage** (check these; the extension sends data off the device only for signed in users):

| Category | Collected? | What and why |
| --- | --- | --- |
| Personally identifiable information | Yes | Name and email for the optional account (entered on our website; the extension stores the email to show who is signed in). |
| Authentication information | Yes | A sign in token from our website, stored by the extension to call Pro features. |
| Website content | Yes | Pro only: the public text of a policy you agreed to, sent to our server to create the AI summary. Listen: the summary text. |
| Web history | Yes | Signed in users only: when a saved policy changes, its address (query string and fragment removed in the extension before sending), a hash of its text, and the risk level go to our anonymous change tracker. Stored without any user id. |
| Health, financial and payment, personal communications, location, user activity | No | Payments happen on Stripe's site, not in the extension. |

**Certifications** (all true; check all three):
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://whatyousignupfor.us/legal/privacy

## 4. Distribution tab

- **Visibility:** Unlisted (only people with the link) is recommended until judging is over; switch to Public later. Both go through the same review.
- **Regions:** All regions.
- **Pricing:** Free (Pro is free with an account).

## 5. Test instructions (for the reviewer)

```
No account is needed for the main features.
1. Visit any site with a cookie banner (for example https://www.crowdstrike.com) and click Accept, or close the banner.
2. Open the extension popup: a receipt appears with a risk score. Click a point to see the policy sentence it came from.
3. Settings > Demo tools > "Simulate stale snapshot" shows a change alert on the newest receipt.
Optional Pro features (free): create an account at https://whatyousignupfor.us/signup and click "Connect the extension" on the account page. AI summaries and Listen turn on; no payment is involved.
```

## 6. After approval

1. Copy the item ID from the Dashboard (32 letters).
2. Add it to the server so "Connect the extension" works with the store build: on the VM, append it to `EXTENSION_ID` in `/etc/consent/env` (comma separated, keep the developer ID), then `systemctl restart consent`. Check with `curl -s https://whatyousignupfor.us/api/config` (`extensionIds` lists both).
3. Replace the install steps on the website and README with the store link: `https://chromewebstore.google.com/detail/<item id>`.

## Review notes

- Broad host permissions (`<all_urls>`) usually mean a longer review (days, sometimes a couple of weeks). The justifications above explain why each permission is needed.
- Updates: bump `version` in `extension/manifest.json`, rebuild, and upload the new zip in the Dashboard (Package tab).
