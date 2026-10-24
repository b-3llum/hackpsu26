# HackPSU Fall 26 Requirements (draft for agent review)

Status: AGREED by both agents on the board (pending info booth answers). Drafted by Super student (agent for Nafiz). The other agent should review this PR and reply on the [message board](https://github.com/b-3llum/hackpsu26/issues/1) with [AGREE] or [COUNTER] per section.

## 1. Event rules and deadlines
- Event: HackPSU Fall 26, ECoRE Building, Penn State. Hacking began Saturday Oct 24, 2:00 PM ET.
- Devpost submission must be created by Saturday 11:30 PM ET (it can be incomplete): http://devpost.hackpsu.org/
- Editing allowed until hacking ends Sunday Oct 25, 1:45 PM ET.
- All participants follow the MLH Code of Conduct.
- Prize money is split equally among winning team members.

## 2. Tracks we are eligible for
| Track | Prize | What judges want |
|---|---|---|
| HackPSU Grand Prize | $2000 / $1000 / $500 | Build something awesome |
| FNB Challenge: Trust, Decisions and Financial Confidence | $1500 + FNB bookbag each | Help people know what info and AI advice to trust, and turn it into confident action |
| Nittany AI Challenge | $99 / $50 / $25 gift card per member (up to 5) | Clear problem, meaningful use of AI, creative approach, working demo, positive impact |
| Research Track | $1500 | A tool that removes a research bottleneck (not our focus) |
| General Track: Mystery Stack | $1500 | Revealed at opening ceremony (TBD, check if our project fits) |

Excluded: AI Strategy Case Challenge (no code; case teams cannot enter the Grand Prize).

Open questions for the info booth (Nafiz to ask):
1. May one project enter Grand Prize + FNB + Nittany AI at the same time?
2. Is building on a pre-existing prototype allowed? Either way we disclose it on Devpost and keep the new hackathon features (finance mode, actions, cited AI summaries) clearly separate.

## 3. Proposed project: Consent Receipts
A Chrome extension (Manifest V3) that saves a plain words "receipt" when a user clicks Agree on terms, cookie banners, or sign up forms, scores the risk, and alerts the user when those terms change. A working prototype already exists (Nafiz's repo NafizM-projects/consent-receipts) and would be imported under `/extension`.

### Must have (MVP for demo)
1. Detect consent clicks (Agree, Accept all, Allow, I agree checkbox) incl. OneTrust, Cookiebot, TrustArc banners.
2. Save a receipt: site, URL, time, button text, policy links, cookie categories.
3. Plain words summary with Low / Medium / High risk and reasons (data sold, tracking, location, biometrics, retention, arbitration, auto renewal, AI training on your content, terms can change).
4. Daily and manual "Check now" for policy changes, with a diff of what changed and a notification.
5. Popup with receipt cards, change history, export (JSON and printable receipt).
6. Offline demo page with terms v1 and v2 so judges see a change alert live.
7. All data stays local in the browser.

### Should have (FNB fit)
1. Finance mode: flag fees, interest rate changes, overdraft terms, auto renewals in bank, loan, and subscription terms.
2. "What to do next" actions per receipt: opt out, delete account, cancel before renewal, with a drafted request.
3. Trust score for AI summaries: show which sentence each claim came from.
4. AI summary with source citations (OpenAI compatible key or local model), with the rules based summary as the fallback. Interface: `summarize(policyText, { mode: "general" | "finance" })` returns `{ risk, claims: [{ text, category, sourceSentence, sourceIndex }], trust }`. Finance detectors return `{ category, sentence, sentenceIndex }` and are merged into claims.

### Nice to have
1. Browser wide privacy score (cut unless we are ahead by Sunday morning).
2. Team or compliance view showing which apps staff agreed to (cut unless we are ahead by Sunday morning).

## 4. Deliverables
- Working extension in `/extension` with README install steps.
- Devpost page: problem, solution, tracks, tech stack, demo video or screenshots, repo link.
- Backup demo video in case the live demo fails.
- 3 minute pitch: problem (people accept terms without reading), live demo of change alert, FNB trust angle, what is next.
- Repo must be public before judging.

## 5. Work split (proposal)
- Super student: import prototype, finance mode, what to do next actions.
- Claude (agent for b-3llum): review, AI summary with source citations (trust score), Devpost page and pitch outline.
- Change via [COUNTER] on the board.

## 6. Collaboration rules
- Work on branches named `agent-<name>/<topic>` and open PRs. No direct pushes to `main`.
- Decisions need [AGREE] from both agents. Two rounds of [COUNTER] with no middle ground means [HUMAN-REVIEW] and pause.
- Writing style for user facing text: no em dashes or en dashes.
