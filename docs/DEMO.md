# Backup demo video: script and shot list

Goal: a 90 second screen recording that matches the live demo in `docs/PITCH.md` (0:50 to 2:20), so we can play it if anything fails on stage.

## Setup before recording
1. Load the unpacked extension from `/extension` in Chrome (chrome://extensions, Developer mode, Load unpacked).
2. Clear old receipts so the popup starts empty (remove and reload the extension, or clear its storage).
3. Serve the demo: `cd extension/demo && python3 -m http.server 8000`.
4. Optional: add a Gemini key in Settings to show the Gemini summary and trust score. Without a key the rules summary is shown; record whichever one we will demo live.
5. Pin the extension icon, close other tabs, zoom the page to about 125% so text is readable in the video.

## Script (about 90 seconds)
| # | Time | On screen | Voiceover |
| --- | --- | --- | --- |
| 1 | 0:00 | `http://localhost:8000/index.html`, cookie banner visible | "This is SnapPix, a fake photo app. Like most sites, it asks us to accept cookies and terms." |
| 2 | 0:08 | Click **Accept all** | "One click, and normally we would forget about it." |
| 3 | 0:12 | Open the popup: new SnapPix receipt, **Medium** risk | "Consent Receipts saved a receipt: the site, the time, the button we clicked, and links to the policies." |
| 4 | 0:22 | Expand a summary point to show its cited sentence | "Every point links to the exact sentence it came from, so you can check the summary instead of trusting it." |
| 5 | 0:35 | Settings > Demo tools > **Simulate terms change (v1 to v2)** | "Now SnapPix quietly updates its terms." |
| 6 | 0:42 | Notification fires, red badge, receipt is now **High** | "We get an alert, and the risk jumps to High." |
| 7 | 0:48 | Diff of what changed: selling data, location, facial recognition, AI training, arbitration | "Here is exactly what changed since we agreed." |
| 8 | 1:00 | Finance flags: monthly auto renewal and the $4.99 late fee | "Finance mode flags the auto renewal and the late fee before they cost us." |
| 9 | 1:10 | **What to do next**: open an action, show cited sentence, click **Copy draft** | "And it tells us what to do next, with a drafted opt out or cancel request ready to send." |
| 10 | 1:25 | Popup overview | "All of this stays in your browser. Read nothing, know everything you agreed to." |

## Screenshots list (for Devpost and slides)
1. Demo site with the cookie banner (before clicking).
2. Popup with the first SnapPix receipt at Medium risk.
3. An expanded summary point showing its source sentence (and the trust score if Gemini is on).
4. The change notification and red badge after the v1 to v2 simulation.
5. The diff view of changed terms at High risk.
6. Finance mode flags (auto renewal, late fee).
7. What to do next list, with one drafted request expanded.
8. Settings page showing Demo tools and the optional Gemini key field (key hidden).

## Notes
- In the demo pages, the finance terms (auto renewal, late fee) only appear in `terms-v2.html`, so finance flags show after the terms change, not on the first receipt. `docs/PITCH.md` lists finance mode as step 3 (before the change); suggest moving it after step 4 there to match.
- Record at 1280x800 or larger, no personal tabs, bookmarks, or keys visible.
- Save the final video in the Devpost Links and media section and keep a local copy on the demo laptop.
