# Your submission guide (plain steps)

Submission window: **Monday 12 Oct, 7:00–11:55 PM IST**. Everything technical is done and pushed. Four things are left for you, in this order: cfo.ai, the demo video, post 2, and post 3 (the submission). Plan about 2–3 hours in total.

All numbers here are real (see `hackathon.md` and `docs/economics.md`).

---

## 1. cfo.ai business plan (about 20 min)

1. Open https://cfo.ai/neathacks and sign up.
2. **Straight away**, go to **Settings → Billing** and cancel the card / subscription, so you are not charged.
3. Create a new company plan. When it asks, enter:
   - **Company:** Crashworthy. Crash tests and a safety rating for AI agents that move money.
   - **Product / pricing** (our suggestion; you can change it):
     - *Starter*: **$49 per agent per month**. Weekly re-test plus a monthly certificate.
     - *Pro*: **$199 per agent per month**. Adds repair sessions (one-change-at-a-time fixes with an audit trail).
   - **Cost per customer (cost of goods), measured in our real runs:**
     - One full re-test: **$0.019**
     - One certification (re-test plus planted-bug check): **$0.058**
     - One repair session (9 rounds): **$1.38**
     - So a Starter customer costs about **$0.13/month** (4 re-tests and 1 certificate) on a cheap model. On a bigger model like Claude Haiku, a re-test costs about $0.36, so roughly $1.50/month. Pro with one repair session is about $3/month.
   - **Fixed costs:** enter your own real numbers (for example hosting and tools). If you have none yet, enter $0 and say so. Don't guess.
   - **Customers / growth:** your own assumption. Keep it modest, e.g. 5 paying agents in month 3. cfo.ai will work out revenue and runway.
4. When the plan is made, export or copy it and send it to me (paste the text, or a PDF or screenshots). I'll save it as `docs/business-plan.md` and commit it.

---

## 2. Demo video (about 3 minutes)

Record your screen with voice. Free options: Loom, or the screen recorder built into your laptop (Windows: Win+Alt+R in Xbox Game Bar; Mac: Cmd+Shift+5). Open these first:
- The certificate: `site/index.html` from the repo. The pictures are in `site/shots/` if you'd rather show images.
- neatlogs: https://app.neatlogs.com, then your project and the **Traces** tab.
- Entire: https://entire.io/gh/NECOKIZZ/Crashworthy/commit/0cb7fb36f8d5ee4dba517ca3fbbd77178e9a583a
- The repo: https://github.com/NECOKIZZ/Crashworthy

**Script** (read it naturally; times are approximate):

| Time | Show | Say |
|---|---|---|
| 0:00–0:20 | Certificate top (`1-certificate.png`) | "Cars get crash tests. AI agents that issue refunds and delete data get a demo. Crashworthy crash-tests an agent before it's trusted with money, and gives it a star rating a buyer can read." |
| 0:20–0:50 | The tests table (`4-tests.png`) | "Each test rebuilds a real AI failure: Air Canada's invented refund policy, the $1 Chevy Tahoe, Replit deleting a production database. Pass or fail is decided by code, not an AI judge. Five tests are hidden from the fixer, to catch overfitting." |
| 0:50–1:20 | neatlogs Traces tab: open a red `crash-test S03-replit-freeze` trace from the "before: v1" run | "Every crash is a neatlogs trace. Here the agent deleted two production rows during a code freeze. That's a 4-severity crash, and it caps the rating." |
| 1:20–1:50 | Certificate incident report for round 1 (`3-gate.png`, lower half) | "The fixer reads the failing traces back from neatlogs. Entire Graph points to the code, and a Claude Code session makes one change: block production deletes. The gate re-runs all 16 tests and keeps it." |
| 1:50–2:20 | "The gate at work" card (`3-gate.png`, top) | "Then we asked it to cut cost. It made the agent 8% cheaper, but safety on the hidden tests fell from 38.5% to 23.1%. The gate rejected it, on the record. Cheaper but less safe doesn't ship." |
| 2:20–2:40 | The Entire link in the browser | "Every fix, and every rejected attempt, is a commit with an Entire checkpoint: the Claude Code session that made it, its reasoning and its edits." |
| 2:40–3:00 | Certificate KPIs and planted bugs (`5-planted-bugs.png`) | "Result: 1 star to 2 stars, visible safety 40% to 65%, hidden safety held. We planted 10 bugs and the suite caught all 10. A certification costs 6 cents. Crashworthy: built on neatlogs, so agents earn trust before they touch money." |

Upload it to YouTube (choose "Unlisted") or Loom, and copy the link.

---

## 3. Post 2: before/after (post it this afternoon)

Attach `site/shots/1-certificate.png` (and `3-gate.png` if you want a second image). Text:

> Crashworthy update #neatHack
>
> Real run: a cheap support agent (nova-lite) crash-tested against 16 rebuilt AI incidents.
> Before: 1★, 40% safe. It deleted prod data in a code freeze and obeyed a hidden note in an order.
> After 9 Claude Code repair rounds: 2★, 65%. 3 fixes kept, 6 rejected, including a cost cut that hurt hidden-test safety.
> Every crash is a @neatlogs trace, every fix an @EntireHQ checkpoint.

(Check the right @handles for neatlogs and Entire before posting.)

## 4. Post 3: the submission (between 7:00 and 11:55 PM IST)

Find the official neatlogs neatHack post on X and press **Quote**. Text:

> Submitting Crashworthy for #neatHack 🚗💥
> Crash tests + a 5-star safety rating for AI agents that move money. Built on neatlogs.
> Team: Crashworthy
> Repo: https://github.com/NECOKIZZ/Crashworthy
> Demo: <your video link>

Then send me the links to posts 2 and 3, and I'll add them to `hackathon.md`.

---

## What to send me
- The cfo.ai plan (text, PDF or screenshots).
- Links to post 2, post 3 and the video.
