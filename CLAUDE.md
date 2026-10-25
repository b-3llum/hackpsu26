# CLAUDE.md

Guidance for Claude Code (and any agent) working in this repo. Human overview: [README.md](README.md).

## Project

Consent Receipts, built at HackPSU Fall 26 (Oct 24 to 25, 2026). A Chrome MV3 extension that saves a receipt for every Agree click, summarizes the terms with a cited source sentence for every point, scores risk, flags money clauses, suggests next actions, and alerts on policy changes. The hosted site https://whatyousignupfor.us adds free accounts that turn on Pro (server side Gemini summaries, Listen: a Gemini written spoken summary read by ElevenLabs), a Tiger Data terms change tracker, Auth0 Google sign in, an install page with a download, and Stripe billing (built, switched off by `FREE_PRO=1`).

Deadline: Devpost submission **Sun Oct 25, 2:00 PM EDT**. Prefer small, verified, demo safe changes over big rewrites.

## Layout

- `extension/`: the extension. Plain ES modules, **no build step, no npm dependencies**. Entry points: `background.js` (module service worker), `content.js` (classic script, every frame), `popup/`, `options/`. Logic lives in `lib/` (`summary/`, `finance/`, `actions/`, `account.js`, `policy.js`, `settings.js`). `tools/build-store.mjs` builds the store zip and (`--download`) the website download.
- `server/`: Node 24 + Express 5 + `node:sqlite`. `src/app.js` has every route; `src/index.js` wires config from env; `src/gemini.js`, `speech.js` (ElevenLabs and the Listen narration), `changes.js` (Tiger Data), `auth0.js`. Pages in `public/` (no inline scripts or styles). Deploy files and `env.example` in `deploy/`.
- `docs/`: Chrome Web Store kit and images. `docs/hackathon/`: Devpost text, pitch, demo script, original plan.

## Commands

```
cd extension && npm test        # node --test, no installs
cd server && npm install && npm test
cd extension/demo && python3 -m http.server 8765    # offline SnapPix demo
```

Run both test suites before every PR. For behavior changes, also verify in a real browser: Chrome for Testing with Puppeteer and `enableExtensions: [extensionPath]` (branded Chrome ignores `--load-extension`). Test against real policy pages, not only fixtures.

## Conventions

- Match the surrounding code: 2 spaces, double quotes, semicolons, ES modules, small pure functions, comments only where the why is not obvious.
- New logic gets `node:test` tests next to the module (`test/`), including the real sentence that motivated it.
- **User facing text:** plain words, no em or en dashes, no fake stats, logos, testimonials, or features that do not ship. Privacy and Terms must match what the code does; update `server/public/legal/privacy.html` in the same PR when data handling changes.
- **Pages:** the CSP is `script-src 'self'` and `style-src 'self'`: no inline `<script>`, no `style=` attributes, no event handler attributes. Render API data with `textContent`, links only for http(s).
- **Extension:** any network call beyond fetching the policy pages goes through the server and only for signed in users. Never put an API key in the extension.
- **Risk rules:** negation is clause scoped (`lib/summary/summarize.js`, `lib/finance/detect.js`); add a regression test for every false positive found on a real site.

## Secrets and safety

- Secrets live in each person's `~/.apikeys` and on the VM in `/etc/consent/env` (mode 640). **Never print, log, commit, or paste them**; read them inside scripts and pipe them where needed (show `NAME=<set>` only).
- Stripe must stay in **test mode**; the server refuses live keys unless `ALLOW_LIVE_STRIPE=1`. Do not use a live key without the owner's explicit OK.
- Changes on the VM, Stripe, Auth0, or DNS are outward facing: confirm with the owner unless already asked.
- The `sqlite3` shell defaults to foreign keys off and user ids can be reused: start manual deletes with `PRAGMA foreign_keys=ON;`.
- Test accounts on the live site: use `+tag@example.com` emails and delete them afterwards (with foreign keys on). Never put test or fake events on the public tracker.

## Production

- VM `root@64.177.46.127` (Ubuntu 24.04), SSH keys only; Claude's key is `~/.ssh/hackpsu26_vultr`. App in `/opt/consent/app`, systemd unit `consent`, Caddy in front, Cloudflare proxied (SSL Full).
- Deploy a branch: `ssh -i ~/.ssh/hackpsu26_vultr root@64.177.46.127 'BRANCH=<branch> bash /opt/consent/app/server/deploy/deploy.sh'`. Check `journalctl -u consent -n 5`: the startup line says which integrations are on.
- Smoke test after deploy: `/`, `/login`, `/signup`, `/account`, `/changes`, `/api/config` return 200; `/logo.png` is an image.

## Collaboration (two agents)

- Board: [issue #1](https://github.com/b-3llum/hackpsu26/issues/1). Other agent: **Super student** (for Nafiz). Claude works for b-3llum (owner, project lead).
- Every board message starts with `[PROPOSAL]`, `[AGREE]`, `[COUNTER]`, `[STATUS]`, `[BLOCKED]`, or `[HUMAN-REVIEW]`.
- Branches `agent-<name>/<topic>`, PRs only, never push to `main`. Merge after both agents `[AGREE]`. Two rounds of `[COUNTER]` without agreement: `[HUMAN-REVIEW]` and stop.
- Post on the board before editing files the other agent owns. When reviewing, run the code against real inputs and report concrete repros.

## Gotchas we already hit

- `gemini-3.8-flash` took about 106 s per summary (thinking); use `gemini-3.5-flash-lite` (about 1 s). Receipts save instantly with rules and upgrade to Gemini in the background.
- ElevenLabs key is IP restricted to the VM: calls from a laptop get 403 `ip_not_allowed`.
- Stripe account has Managed Payments on: products need a tax code (`txcd_10103000`), handled in `deploy/stripe-setup.mjs`.
- Cloudflare injects an analytics beacon; the CSP blocks it on purpose.
- The tracker ignores localhost, IP, and single label hosts, and the extension never reports changes made by the Simulate demo tools.
- zsh: `$VAR:e` style text after a variable is a history modifier; write `${VAR}:...`. `pkill -f` inside an ssh command can match and kill its own shell.
- HackPSU rules: "Use of an existing project is not allowed." The prior work question for Nafiz's prototype is open with the organizers; keep `docs/hackathon/DEVPOST.md` accurate and do not claim organizer approval without a written answer.
- Listen audio is 32 kbps (`mp3_22050_32`); 128 kbps was 4x larger and slow through Cloudflare. Bump `NARRATION_VERSION` in `server/src/speech.js` when the narration prompt changes so cached audio is regenerated.
- The popup re-renders on storage changes; anything stateful in it (like Listen) must survive or defer re-renders.
- `deploy.sh` updates itself mid run: after changing it, deploy twice. Cloudflare caches `.zip` for hours, so download links carry `?v=<build time>`.
