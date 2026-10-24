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
- Shows where each claim came from: every point in the summary expands to the exact sentence in the policy, so you can check the summary instead of trusting it blindly.
- Optional Gemini summary: Gemini must cite a numbered policy sentence for every point. Points without a real source are dropped and lower a visible trust score, and rule based findings always stay, so the AI can add context but cannot hide a flagged clause.
- Finance mode flags fees, interest rate changes, overdraft terms, and auto renewals in bank, loan, and subscription terms.
- Checks your saved policies daily (or on demand), shows a diff of what changed, and notifies you.
- Suggests what to do next for each receipt (opt out of data sale or AI training, opt out of arbitration, cancel before renewal, opt out of overdraft, request deletion), each with the cited sentence, a drafted request you can copy, and a link to the policy.
- Keeps all data local in your browser. Export receipts as JSON or a printable receipt.

## How we built it
- Chrome extension, Manifest V3, plain ES modules with no dependencies (content script for consent detection, module service worker for policy fetches and scheduled checks, popup UI).
- Rule based detectors for risk categories and finance terms, with tests.
- Gemini API (`gemini-3.8-flash` via `generateContent`, JSON output) for cited summaries, falling back to rules when no key is set or the call fails.
- Local storage only; no backend.
- 51 node tests, plus an end to end run of the demo in Chrome with the extension loaded.

## Prior work disclosure
Draft, for Nafiz to confirm: Nafiz built an early prototype of the consent receipt and policy change alert features before HackPSU Fall 26, and HackPSU organizers confirmed importing it is allowed. Built during the hackathon: finance mode (fee, interest rate, overdraft, late payment, minimum balance, auto renewal detectors), cited summaries with a trust score, Gemini integration, what to do next actions with drafted requests, negation aware rules, smarter consent detection (iframes, fewer false captures), and a refactor of the whole extension into ES modules with tests.

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
- Nittany AI Challenge (Gemini summaries that must cite their sources, with a rules fallback)
- TODO: General Track: Mystery Stack, if the revealed stack fits

## Built with
javascript, chrome-extension, manifest-v3, gemini-api, node-test

## Links and media
- Repo: https://github.com/b-3llum/hackpsu26 (must be public before judging)
- Demo video: TODO (backup in case the live demo fails)
- Screenshots: TODO (receipt card, risk summary with highlighted source sentence, change alert diff, finance flags)
