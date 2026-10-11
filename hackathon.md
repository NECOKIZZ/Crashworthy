# neatHack 2026 build log: Crashworthy

## Project
Crash tests and a 5-star safety rating for AI agents that move money. Tests rebuilt from real AI incidents, scored by code, with a held-out set, a one-change-at-a-time repair loop gated on safety and cost, and planted bugs that prove the suite is strong.

## Team
NECOKIZZ (with Claude Code as the coding agent).

## Stack
TypeScript · Node 22 · neatlogs SDK `neatlogs@1.1.28` (wrapOpenAI, trace/span, Public API readback) · Entire CLI 0.11.4 · neatHack LiteLLM proxy (OpenAI-compatible) · vitest.

## Build log

### 2026-10-11 (IST afternoon)
- Researched neatlogs and the neatHack rules. neatlogs already covers finding failures in production, fix briefs for Claude Code/Cursor and watching that a fix holds. Crashworthy builds on top of it for the step *before* production: crash-testing an agent against real incidents before it gets money authority, with neatlogs traces as the evidence for every crash and every fix.
- Created the repo and enabled Entire (`entire enable --agent claude-code`).
- Built the sandboxed shop, the ShopAssist crash dummy (8 tools, guard layer), 16 scenarios (11 visible, 5 hidden) with cited sources, severity weights and the star-rating caps.
- Every check is tested both ways: 35 tests run each scenario against a known-bad and a known-good scripted behaviour (`test/suite.test.ts`), plus a snapshot test. **All pass.**
- Built the repair loop (`heal`), the gate (visible ↑, hidden not ↓, no S3/S4 regressions, cost ≤ +30%), planted-bug mutants and the certificate site.
- **Fixture dry run** (scripted stand-in models, not real LLMs; not evidence of agent behaviour): the loop ran baseline → kept a guard (visible 50.9% → 78.9%, hidden held) → rolled back a repeat that didn't improve → promoted the kept version. It caught three harness bugs before any credits were spent: the fixer's neatlogs client crashed without an ingest key; TypeScript 7 rejects explicit files next to a tsconfig; snapshot import paths broke when a guard imported the sandbox. All three are fixed.
- Built `crash verify`: a neatlogs Public API readback audit (whoami, trace finalization polling, every span page, payload decoding, graph-vs-execution comparison).

- Acted on a rival agent's review: reframed the pitch as building on top of neatlogs; added a **cost-cutting round** (`heal --cost-round N`: the fixer is asked to cut cost and the same gate decides, so a cheaper-but-less-safe agent is rejected on the record); `crash economics` (real per-run costs from neatlogs → inputs for the cfo.ai plan, `docs/economics.md`); `crash shots` (report screenshots for #neatHack posts). Kept all 16 tests: they are built and tested both ways, and a full run costs cents. Fixture dry run of the new pieces passed.

- **neatlogs connected** (project `f6d0cf85-94dd-42fb-8d22-f363d1cd4f2d`). SDK Doctor `--local` and `--probe` both pass (probe trace `727f7043053bbe33b0e8598feda56ab0`: exported, finalized, hierarchy/IO/tokens intact). The project key returns 401 on the Public API, as documented, so readback uses a `neatlogs-cli` device-flow login with file credentials (the container has no keychain).
- **Fixture traces** (scripted stand-in model, no LLM): Crashworthy's real trace shape persisted. In S05 (`0c4f143b…`, bad run) the workflow root, the agent turn, two `issue_refund` TOOL spans with status ERROR (the 504 ghost timeout), a reply and the EVALUATOR verdict ("2 refunds issued for one order") were all read back with payloads intact. `crash verify` matched everything except LLM spans, which are expected to be absent with a scripted model. Found and fixed during readback: the SDK's own `neatlogs` binary shadowed the CLI under npx; CLI errors are on stderr; ingestion took about a minute (polling window raised to 3 minutes).

### Pending
- Real-model runs: needs `LITELLM_API_KEY`/`LITELLM_BASE_URL` (neatlogs is connected).
- Baseline → heal → mutate → verify on real models; before/after traces; cfo.ai business plan; demo video; #neatHack posts.

## Demo
_Pending._

## Limitations
- LLM behaviour varies between runs even at temperature 0. Headline numbers will be reported with repeats (`--repeats 2`, worst-of-N).
- Text checks (promises, policy claims) use deterministic patterns and the agent's structured `reply_to_customer` fields. They are tested both ways, but an agent could phrase a promise in a way the patterns miss.
- The gate's accept/reject signal depends on the hidden score, so a little hidden-set information reaches the fixer through which changes survive. Test identities, traces and content never do.

## Submission status
Not submitted.
