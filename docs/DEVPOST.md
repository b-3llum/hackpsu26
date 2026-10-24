# Devpost draft: Consent Receipts

Draft for the Devpost page at http://devpost.hackpsu.org/. The entry must exist by Saturday 11:30 PM ET (it can be incomplete) and can be edited until Sunday 1:45 PM ET. Items marked TODO need real details before we submit.

## Tagline
Know what you agreed to, and know when it changes.

## Inspiration
Almost nobody reads terms of service, cookie banners, or bank and subscription agreements before clicking Agree. Those documents decide whether your data is sold, whether your subscription auto renews, and what fees you can be charged. They also change quietly after you sign up. We wanted a tool that turns that click into something you can understand, keep, and trust.

## What it does
Consent Receipts is a Chrome extension that:
- Saves a receipt every time you click Agree, Accept all, Allow, or an "I agree" checkbox, including OneTrust, Cookiebot, and TrustArc banners. Each receipt records the site, URL, time, button text, policy links, and cookie categories.
- Summarizes the terms in plain words with a Low, Medium, or High risk score and the reasons (data sold, tracking, location, biometrics, retention, arbitration, auto renewal, AI training on your content, terms can change).
- Shows where each claim came from: every point in the summary links to the exact sentence in the policy, so you can check the summary instead of trusting it blindly.
- Finance mode flags fees, interest rate changes, overdraft terms, and auto renewals in bank, loan, and subscription terms.
- Checks your saved policies daily (or on demand), shows a diff of what changed, and notifies you.
- Suggests what to do next for each receipt: opt out, delete your account, or cancel before renewal, with a drafted request.
- Keeps all data local in your browser. Export receipts as JSON or a printable receipt.

## How we built it
- Chrome extension, Manifest V3 (content scripts for consent detection, service worker for scheduled policy checks, popup UI).
- Rule based detectors for risk categories and finance terms, with tests.
- AI summary with per claim source citations (TODO: name the model/provider we pick), falling back to rules when no key is set.
- Local storage only; no backend.

## Prior work disclosure
TODO (pending info booth answer): Nafiz built an early prototype of the receipt and change alert features before HackPSU. During the hackathon we built: finance mode, what to do next actions, cited AI summaries and trust score, TODO list anything else. Keep this section accurate and specific.

## Challenges we ran into
TODO: fill in Sunday morning (e.g. detecting consent clicks across many banner vendors, splitting policy text into citable sentences, avoiding AI claims that are not backed by the text).

## Accomplishments we are proud of
TODO: fill in Sunday morning.

## What we learned
TODO: fill in Sunday morning.

## What is next
- Browser wide privacy score.
- Team or compliance view showing which apps staff agreed to.
- Support for more browsers.

## Tracks
- HackPSU Grand Prize
- FNB Challenge: Trust, Decisions and Financial Confidence (cited summaries show what to trust; finance mode and next actions turn it into confident action)
- Nittany AI Challenge (meaningful AI use with citations and a rules fallback)
- TODO: General Track: Mystery Stack, if the revealed stack fits

## Built with
TODO: javascript, chrome-extension, manifest-v3, plus the AI provider.

## Links and media
- Repo: https://github.com/b-3llum/hackpsu26 (must be public before judging)
- Demo video: TODO (backup in case the live demo fails)
- Screenshots: TODO (receipt card, risk summary with highlighted source sentence, change alert diff, finance flags)
