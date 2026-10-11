# Handoff: finish Crashworthy for neatHack

You are picking up Crashworthy, a neatHack 2026 entry. Read `README.md` and `hackathon.md` first. Every piece of code is built and tested (42 vitest tests). What is left is **real-model runs, evidence, and submission material**.

## Deadline and rules
- Submission window: **Monday 12 Oct 2026, 7:00–11:55 PM IST**. The user quote-posts the official neatlogs post on X with team (Crashworthy), project, public repo and demo video. Aim to have everything ready by Monday afternoon IST.
- Judging: agent 30% · use of neatlogs + Entire + cfo.ai 25% · demo video 20% · building in public (#neatHack posts) 15% · usefulness 10%. Separate prize: **Best Use of Entire** (Checkpoints, Graph, Brain).
- Evidence required: a before/after pair of runs with numbers, neatlogs trace links/screenshots, Entire checkpoints, a cfo.ai business plan (pricing, costs, revenue, runway), a failure-recovery run, #neatHack post links, and commits dated during the hackathon.
- **Real numbers only.** Label fixture or synthetic evidence as such. Never invent results.
- Pitch framing: Crashworthy **builds on top of neatlogs** (neatlogs finds and fixes failures in production; Crashworthy crash-tests an agent before it is trusted with money). Do not claim neatlogs lacks features. Its founder is a judge.

## Secrets
- Never print, commit or paste keys. Env vars: `LITELLM_API_KEY`, `LITELLM_BASE_URL` (`https://litellm.vision.aivar.app/v1`), `NEATLOGS_API_KEY` (SDK ingest key; project `f6d0cf85-94dd-42fb-8d22-f363d1cd4f2d`).
- `.env` is gitignored. Recreate it with the non-secret values:
  ```
  LITELLM_BASE_URL=https://litellm.vision.aivar.app/v1
  CW_NEATLOGS_PROFILE=setup-https---app-neatlogs-com
  NEATLOGS_PROJECT_ID=f6d0cf85-94dd-42fb-8d22-f363d1cd4f2d
  ```
- The project key cannot read the Public API (401). Readback uses a neatlogs-cli device login (step 3 below).
- Before publishing an Entire checkpoint, grep its transcript for secrets.

## Setup in a fresh container
1. `pnpm install`
2. **Entire CLI** (the install script's GitHub API call is blocked here; the Go module proxy works):
   ```
   GOTOOLCHAIN=auto go install github.com/entireio/cli/cmd/entire@latest && ln -sf ~/go/bin/entire /usr/local/bin/entire
   entire plugin install graph
   entire status        # should say Enabled, checkpoints on the entire/checkpoints/v1 branch
   ```
3. **neatlogs read access** (the user approves a link in their browser; the container has no keychain):
   ```
   env -u NEATLOGS_API_KEY -u NEATLOGS_TOKEN -u NEATLOGS_PROJECT_ID node node_modules/neatlogs-cli/dist/bin.js \
     --host https://app.neatlogs.com --profile setup-https---app-neatlogs-com auth login --device --allow-file-credentials
   ```
   Run it in the background, give the user the `verificationUriComplete` link, then check with `pnpm crash whoami`.
4. `pnpm crash models`: pick a cheap tool-calling model for the agent (`CW_AGENT_MODEL`, e.g. a Haiku or Nova Lite) and a strong one for the LLM fixer (`CW_FIXER_MODEL`). The neatHack LiteLLM budget is $20 for the whole team, so watch spend.
5. SDK check: `node node_modules/neatlogs/dist/cli.mjs doctor --probe --json` should pass.

## The run sequence
1. `pnpm crash run --label "baseline v1"`, then `pnpm crash verify`. This is the real before picture. Expect v1 (no guards, naive prompt) to fail several tests.
2. `pnpm crash heal --rounds 6 --cost-round 5 --fixer claude-code --commit`. Each round is a headless Claude Code session that Entire records. Kept fixes are committed; rolled-back attempts are committed and then reverted. Round 5 is the cost-cutting round, where a cheaper but less safe change should be rejected on the record. Watch the first round closely. If the Claude Code fixer misbehaves, `--fixer llm` uses `CW_FIXER_MODEL` instead.
3. `pnpm crash mutate`: planted bugs, gives "suite strength X/10".
4. `pnpm crash verify <final runId>`: every trace audited against neatlogs.
5. `pnpm crash economics`: real costs into `docs/economics.md`, which become the cfo.ai inputs.
6. `pnpm crash report && pnpm crash shots`: `site/index.html` plus PNGs in `site/shots/` for the posts.
7. Update `hackathon.md` with real numbers, trace IDs and checkpoint IDs/links. Commit and push to `main` (remote `NECOKIZZ/crashworthy`).

LLM results vary from run to run; consider `--repeats 2` for the headline before/after.

## Still for the user (help them; they are not technical)
- **cfo.ai:** sign up at https://cfo.ai/neathacks and cancel the card immediately (Settings → Billing). Give them the numbers from `docs/economics.md` and suggested pricing to enter. Save the resulting plan as `docs/business-plan.md`.
- **Demo video (~3 min):** write a scene-by-scene script, using the certificate, a neatlogs trace, the gate rejecting the cost cut, and an Entire checkpoint.
- **Posts:** post 1 is done (https://x.com/0xnecokizz/status/2109258022627282999). Post 2: before/after numbers with the certificate screenshot. Post 3: the submission quote-post. Keep posts short and always include #neatHack.
- Entire checkpoint link format: `https://entire.io/gh/NECOKIZZ/Crashworthy/commit/<full sha>`.
