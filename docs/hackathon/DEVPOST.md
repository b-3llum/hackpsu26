# Consent Receipts

**Know what you signed up for.**

A Chrome extension that keeps a plain words receipt every time you click Agree, links every risk to the exact sentence in the policy, and tells you when the terms change.

## Inspiration

Almost nobody reads the terms of service, cookie banners, or bank and subscription agreements they accept. Those documents decide whether your data is sold, whether a plan renews on its own, which fees you can be charged, and whether you can ever take a company to court. They are long, written for lawyers, and they change quietly after you sign up.

AI can summarize a policy, but that creates a new problem: how do you know the summary is right? We wanted a tool that turns the moment you click Agree into something you can understand, keep, verify, and act on.

## What it does

- **A receipt for every Agree.** When you click Agree, Accept all, Allow, tick an "I agree" box, or close a cookie notice, the extension saves the site, the time, the button you clicked, the policy links, and your cookie choices. It recognizes OneTrust, Cookiebot, TrustArc, and Quantcast banners, including ones inside iframes.
- **A summary you can check.** It reads the linked terms and privacy policy and lists what you agreed to in plain words, with a Low, Medium, or High risk score: data sold or shared, tracking, location, biometrics, retention, forced arbitration, AI training on your content, and terms that can change. Every point opens to the exact policy sentence behind it.
- **AI that cannot hide anything.** With a free account, Google Gemini adds a summary in which every point must cite a numbered sentence from the policy. Points without a real source are dropped and lower a visible trust score, and the rule based findings always stay on screen.
- **Finance mode.** Flags fees, late payments, interest rate changes, overdraft, minimum balances, and auto renewals in bank, loan, and subscription terms.
- **What to do next.** Opt out of data sale or AI training, opt out of arbitration, cancel before a renewal, or request deletion, each with the cited sentence and a drafted request you can copy.
- **Change alerts.** Saved policies are rechecked daily or on demand. When one changes you get a notification, the sentences added and removed, and the risk before and after.
- **Listen.** One tap plays a 30 second spoken summary: Gemini writes it from the cited points (the site, the biggest risks with specifics, money terms, and the best next step) and ElevenLabs reads it aloud.
- **A public terms change tracker.** Signed in users anonymously report policy changes, which power a public "what changed this week" page and a "changed N times in 90 days" note on each receipt.

Everything core runs in your browser with no account. A free account turns on AI summaries and Listen.

## How we built it

- **Extension:** Chrome Manifest V3 in plain ES modules with no dependencies. A content script detects consent clicks in every frame; a module service worker fetches policies, runs the rule engine and finance detectors, schedules rechecks, and sends notifications. Receipts appear instantly from the local rules and upgrade to the AI summary in the background.
- **Rules:** negation aware, clause scoped detectors for privacy and money terms, tuned against real policies from DuckDuckGo, Netflix, Spotify, Google, TikTok, and CrowdStrike.
- **Server:** Node 24, Express 5, and SQLite on a **Vultr** VM, behind Caddy and Cloudflare, running as a sandboxed systemd service. It serves the website (landing, sign in, account, install, change tracker) and an API for signed in features, so no API key ever ships in the extension.
- **Google Gemini** (`gemini-3.5-flash-lite`) writes cited summaries and the Listen narration, with JSON output and server side checks on every citation.
- **ElevenLabs** (`eleven_flash_v2_5`) turns the narration into speech; audio is cached per receipt.
- **Tiger Data** (TimescaleDB hypertable with `time_bucket`) stores anonymous change events: policy address without query string, text hash, risk, and time, with no user id.
- **Auth0** provides Continue with Google (code flow with state and PKCE, verified emails only), alongside email and password accounts hashed with scrypt.
- **Stripe** Checkout, billing portal, and signed webhooks are built and were tested end to end in test mode; billing is switched off while Pro is free.
- **Quality:** 82 automated tests, plus end to end runs in Chrome for Testing with the extension loaded: the offline demo, real cookie banners, the live site, the install flow, and checkout.

## Challenges we ran into

- **Consent is messy.** Some banners have no Accept button at all (CrowdStrike's notice only has Close), others live in iframes, and "Continue" often has nothing to do with consent. We had to recognize implied consent on known consent banners without recording every closed popup.
- **False alarms on real sites.** Our first rules rated DuckDuckGo's "We don't track you" policy as High risk: curly apostrophes, "never sold", "Feedback" matching "fee", and "as long as necessary" all tripped them. Testing on live policies, not only fixtures, is what found these.
- **Making AI trustworthy.** Free form AI summaries can invent claims. Requiring a numbered citation for each point, verifying it on the server, and keeping the rule findings visible turned the summary into something you can check.
- **Speed.** Our first Gemini model took about 106 seconds per summary because of its thinking step. Switching models brought it to about one second, and saving receipts instantly from the rules made the experience independent of AI latency.
- **Privacy by design.** Every server feature had to send the minimum: no browsing history, no query strings, no user ids on change events, and nothing at all without an account.

## Accomplishments that we're proud of

- A complete, live product in one weekend: extension, website, accounts, AI summaries, voice, a public tracker, and a one minute install flow, all at https://whatyousignupfor.us.
- Every AI claim is backed by a sentence you can read, and the AI can add context but never hide a flagged clause.
- Real world accuracy work: the extension now handles the actual banners and policies of major sites instead of only our demo.
- Security we would ship: hashed passwords and sessions, CSRF protection, rate limits, signed webhooks, and protection against account takeover when linking Google sign in.

## What we learned

- Trust in AI comes from verifiability, not from better wording. Citations changed how the summaries feel.
- Testing against real pages finds problems that unit tests never will.
- Slow AI is a product problem: designing so the app is useful before the AI answers made the biggest difference.
- Two AI agents and two people can build in parallel when every change goes through a proposal, a review, and an agreement.

## What's next for Consent Receipts

- Publishing on the Chrome Web Store, then Edge and Firefox.
- A privacy score across everything you have agreed to.
- A team view so companies can see which services their staff agreed to.
- Alerts for the policy changes that matter most to finances, like new fees or rate changes.

## Prior work

Nafiz built an early prototype of the receipt capture and policy change alert features before HackPSU Fall 2026. Built during the hackathon: finance mode, cited AI summaries with trust scores, negation aware rules tuned on real sites, implied consent and iframe detection, what to do next actions, Listen, the change tracker, the website with accounts and Google sign in, the install flow, and the rewrite of the extension into tested ES modules.

## Tracks

- **HackPSU Grand Prize**
- **FNB Challenge: Trust, Decisions and Financial Confidence.** Cited summaries show people what to trust; finance mode and next actions turn that into confident action on fees, renewals, and rate changes.
- **Nittany AI Challenge.** AI that must cite its sources, with a rules fallback, plus spoken summaries that make terms accessible to people who prefer to listen.

## Built with

javascript, chrome-extension, manifest-v3, node.js, express, sqlite, google-gemini, elevenlabs, tiger-data, timescaledb, auth0, stripe, vultr, caddy, cloudflare

## Try it out

- Website: https://whatyousignupfor.us
- Install the extension: https://whatyousignupfor.us/install
- Terms change tracker: https://whatyousignupfor.us/changes
- Source code: https://github.com/b-3llum/hackpsu26

Screenshots for the gallery are in [`docs/store/`](../store/): `screenshot-01-receipt.png` to `screenshot-05-changes.png`.

## Open source and services used

- Express (https://expressjs.com), the Stripe Node library (https://github.com/stripe/stripe-node), and node-postgres (https://node-postgres.com) on the server
- Node.js built in modules: `node:sqlite`, `node:crypto` (scrypt), `node:test`
- Google Gemini API, ElevenLabs text to speech API, Tiger Data (TimescaleDB), Auth0, Stripe (test mode)
- Vultr (hosting), Caddy (HTTPS), Cloudflare (DNS and proxy)
- Inter typeface (Google Fonts)
- Puppeteer with Chrome for Testing for end to end tests (development only, not shipped)

Everything else (the extension, rules, finance detectors, summaries, server, and pages) was written for this project.
