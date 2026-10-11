# neatHack 2026 build log: Crashworthy

## Project
Crash tests and a 5-star safety rating for AI agents that move money. Tests rebuilt from real AI incidents, scored by code, with a held-out set, a one-change-at-a-time repair loop gated on safety and cost, and planted bugs that prove the suite is strong.

## Team
NECOKIZZ (with Claude Code as the coding agent).

## Stack
TypeScript · Node 22 · neatlogs SDK `neatlogs@1.1.28` (wrapOpenAI, trace/span, Public API readback) · Entire CLI 0.11.4 · neatHack LiteLLM proxy (OpenAI-compatible) · vitest.

## Build log

### 2026-10-11 (IST afternoon)
- Researched neatlogs and the neatHack rules; mapped the gaps in neatlogs' own docs (Datasets "coming soon", Claude Code fix dispatch "planned", no automatic check that a fix held). Picked Crashworthy.
- Created the repo and enabled Entire (`entire enable --agent claude-code`).
- Built the sandboxed shop, the ShopAssist crash dummy (8 tools, guard layer), 16 scenarios (11 visible, 5 hidden) with cited sources, severity weights and the star-rating caps.
- Every check is tested both ways: 35 tests run each scenario against a known-bad and a known-good scripted behaviour (`test/suite.test.ts`), plus a snapshot test. **All pass.**
- Built the repair loop (`heal`), the gate (visible ↑, hidden not ↓, no S3/S4 regressions, cost ≤ +30%), planted-bug mutants and the certificate site.
- **Fixture dry run** (scripted stand-in models, not real LLMs; not evidence of agent behaviour): the loop ran baseline → kept a guard (visible 50.9% → 78.9%, hidden held) → rolled back a repeat that didn't improve → promoted the kept version. It caught three harness bugs before any credits were spent: the fixer's neatlogs client crashed without an ingest key; TypeScript 7 rejects explicit files next to a tsconfig; snapshot import paths broke when a guard imported the sandbox. All three are fixed.
- Built `crash verify`: a neatlogs Public API readback audit (whoami, trace finalization polling, every span page, payload decoding, graph-vs-execution comparison).

### Pending
- Real-model runs: needs `LITELLM_API_KEY`/`LITELLM_BASE_URL`, `NEATLOGS_API_KEY`, `NEATLOGS_TOKEN`.
- Baseline → heal → mutate → verify on real models; before/after traces; cfo.ai business plan; demo video; #neatHack posts.

## Demo
_Pending._

## Limitations
- LLM behaviour varies between runs even at temperature 0. Headline numbers will be reported with repeats (`--repeats 2`, worst-of-N).
- Text checks (promises, policy claims) use deterministic patterns and the agent's structured `reply_to_customer` fields. They are tested both ways, but an agent could phrase a promise in a way the patterns miss.
- The gate's accept/reject signal depends on the hidden score, so a little hidden-set information reaches the fixer through which changes survive. Test identities, traces and content never do.

## Submission status
Not submitted.
