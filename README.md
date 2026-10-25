# Consent Receipts

**Know what you signed up for.** A Chrome extension that saves a plain words receipt every time you click Agree, shows the exact policy sentence behind every risk, and alerts you when the terms change. Built at HackPSU Fall 26.

- Live site: https://whatyousignupfor.us (landing page, accounts, Pro billing, terms change tracker)
- Message board for the agents: [issue #1](https://github.com/b-3llum/hackpsu26/issues/1)
- Devpost text, pitch, and demo script: [`docs/`](docs/)

## Deadlines and open items

- **Devpost submission: Sunday Oct 25, 2:00 PM EDT** at http://devpost.hackpsu.org/ (paste from [`docs/DEVPOST.md`](docs/DEVPOST.md)). At least one team member must present at the judging expo.
- **Rules question, needs a human:** the official rules say "Use of an existing project is not allowed, except for common templates or boilerplate." Part of the extension started from Nafiz's pre-HackPSU prototype. Get a written answer from team@hackpsu.org or discord.hackpsu.org, and keep the prior work section in `docs/DEVPOST.md` accurate.
- **Chrome Web Store:** not submitted yet (needs a developer account, $5). Until then, install the extension unpacked (below).

## What it does

| | Free (in your browser) | Pro ($3/month, Stripe test mode) |
| --- | --- | --- |
| Receipt for every Agree, Accept all, Allow, "I agree" box, and closed cookie notice | yes | yes |
| Plain words summary, Low / Medium / High risk, every point linked to its source sentence | rule based | plus Gemini, with a trust score |
| Finance mode: fees, rate changes, overdraft, late payment, minimum balance, auto renewal | yes | yes |
| Change alerts with a diff, What to do next actions with drafted requests | yes | yes |
| Listen to a receipt (ElevenLabs) | 3 a day (account needed) | unlimited |
| Public terms change tracker at `/changes` (Tiger Data) | reports when signed in | reports when signed in |

Free never sends anything to our server. Pro sends only the public policy text; summaries are cached per policy; we don't keep a record of which sites anyone visits. See [`server/public/legal/privacy.html`](server/public/legal/privacy.html).

## Try it in 2 minutes

1. **Install the extension:** open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the [`extension/`](extension/) folder. Pin the Consent Receipts icon.
2. **Run the offline demo:**
   ```
   cd extension/demo && python3 -m http.server 8765
   ```
   Open http://127.0.0.1:8765/index.html, click **Accept all**, and open the popup: a SnapPix receipt at **Medium**. Expand a point to see its source sentence.
3. **See a terms change:** popup > **Settings** > **Demo tools** > **Simulate terms change (v1 to v2)**. You get a notification, the receipt goes to **High**, with the diff, finance flags, and **What to do next**.
4. **Pro features:** sign up at https://whatyousignupfor.us (or **Settings > Sign in**), click **Connect the extension** on the account page, then **Upgrade to Pro** and pay with test card `4242 4242 4242 4242`, any future date, any CVC. Receipts switch to Gemini summaries a moment later, and **Listen** plays them aloud.

Full demo and pitch flow: [`docs/DEMO.md`](docs/DEMO.md), [`docs/PITCH.md`](docs/PITCH.md).

## Repo layout

| Path | What |
| --- | --- |
| [`extension/`](extension/) | Chrome MV3 extension (plain ES modules, no build step). See [`extension/README.md`](extension/README.md). |
| `extension/lib/summary/` | `summarize(text, { mode, llm })`: cited claims, risk, trust; negation aware rules |
| `extension/lib/finance/` | Finance detectors and the shared sentence splitter |
| `extension/lib/actions/` | What to do next actions with drafted requests |
| `extension/lib/account.js` | Signed in account, Pro summaries, Listen, change reports (all through the server) |
| [`server/`](server/) | The website and API: Node 24, Express, `node:sqlite` |
| `server/src/` | `app.js` (routes), `auth.js` (scrypt, sessions), `speech.js` (ElevenLabs), `changes.js` (Tiger Data), `auth0.js` (Google sign in) |
| `server/public/` | Landing, login, signup, account, `/changes`, Terms, Privacy, logo |
| `server/deploy/` | systemd unit, Caddyfile, `deploy.sh`, `env.example`, `stripe-setup.mjs` |
| `server/brand/` | Logo sources (SVG) |
| [`docs/`](docs/) | Devpost draft, pitch outline, demo video script |
| [`REQUIREMENTS.md`](REQUIREMENTS.md) | The plan both agents agreed on |

## Tests

```
cd extension && npm test     # 63 tests: rules, finance, summaries, actions, account, Gemini adapter, SnapPix demo flow
cd server && npm test        # 13 tests: auth, CSRF, rate limits, Stripe webhook, Pro gate, cache, Listen, tracker, Auth0
```

The extension tests need no installs; the server needs `npm install` once.

## Run the server locally

```
cd server && npm install
PUBLIC_URL=http://localhost:3000 EXTENSION_ID=legohnmopgodooidnpmfajmiopenlogl GEMINI_API_KEY=... INSECURE_COOKIES=1 npm start
```

Every integration is optional: without its key the feature is simply off (`GET /api/config` shows which are on). All variables are listed in [`server/deploy/env.example`](server/deploy/env.example). Never commit real keys; the server refuses to start with a live Stripe key.

## Production

| | |
| --- | --- |
| Host | Vultr VM `64.177.46.127`, Ubuntu 24.04. SSH with keys only (passwords are off for every account); fallback is the Vultr web console. |
| Domain | `whatyousignupfor.us`, DNS on Cloudflare (proxied, SSL mode Full) |
| Web | Caddy (Let's Encrypt) to the app on `127.0.0.1:3000`, systemd unit `consent`, sandboxed |
| Data | SQLite at `/var/lib/consent/consent.db` (accounts, sessions, caches); Tiger Cloud for change events |
| Secrets | `/etc/consent/env` on the VM (mode 640). Local copies live in each person's own `~/.apikeys`, never in the repo. |
| Deploy | `ssh root@64.177.46.127 'BRANCH=main bash /opt/consent/app/server/deploy/deploy.sh'` |
| Logs | `journalctl -u consent -f` and `journalctl -u caddy` |

Services: Google Gemini (`gemini-3.5-flash-lite`), Stripe (test mode, product "Consent Receipts Pro"), ElevenLabs (`eleven_flash_v2_5`, key restricted to the VM's IP), Tiger Data (TimescaleDB), Auth0 (Google connection; callback `https://whatyousignupfor.us/auth/callback`), Cloudflare.

When deleting rows by hand with the `sqlite3` shell, run `PRAGMA foreign_keys=ON;` first, or orphan sessions can attach to the next new account.

## How we work

Two AI agents and their humans share this repo. Agent instructions (commands, conventions, security rules, deploy steps, known gotchas) are in [`CLAUDE.md`](CLAUDE.md); [`AGENTS.md`](AGENTS.md) points other agents there. PRs use the checklist in [`.github/pull_request_template.md`](.github/pull_request_template.md).

- **Claude** (for b-3llum, repo owner and project lead) and **Super student** (for Nafiz) coordinate on [issue #1](https://github.com/b-3llum/hackpsu26/issues/1) with tags `[PROPOSAL]`, `[AGREE]`, `[COUNTER]`, `[STATUS]`, `[BLOCKED]`, `[HUMAN-REVIEW]`.
- Work happens on branches named `agent-<name>/<topic>` with a PR; nothing is pushed straight to `main`. A PR merges after both agents `[AGREE]`. Two rounds of `[COUNTER]` without agreement means `[HUMAN-REVIEW]`.
- Reviews check behavior on real data (live sites, the real browser), not only the tests.
- User facing text: plain words, no em or en dashes, no fake stats, logos, or testimonials.

## Credits

Open source and services used are listed in [`docs/DEVPOST.md`](docs/DEVPOST.md) (required by the HackPSU rules).

## License

[MIT](LICENSE).
