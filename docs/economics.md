# Unit economics (from real runs)

Source of costs: **agent: provider-reported tokens × the published price for `nova-lite`; fixer: the cost each Claude Code session reported**.

neatlogs cross-check: 466/494 traces found; stored tokens 2,470,575 vs local 2,470,575 for those traces (100.0%); stored cost $0.0000 (neatlogs has no price for this model, so token counts are the check). Agent model `nova-lite`, fixer model `claude-sonnet-4.6`. Generated 2026-10-12T01:56:15.019Z by `pnpm crash economics`.

| What | Cost (USD) | Basis |
|---|---|---|
| One crash test (one scenario run) | $0.00040 | final run run_20261012011703_1a609c, 48 traces |
| One full re-test (all 48 tests) | $0.019 | final run |
| Planted-bug check (all mutants) | $0.038 | 10 mutant runs |
| **One certification** (full re-test + planted bugs) | **$0.058** | sum of the two above |
| One repair round (fixer + full re-test) | $0.153 | average of 9 rounds |
| Whole repair session | $1.377 | 9 rounds, 3 kept |

## Per round
| Round | Mode | Kept | Fixer | Re-test |
|---|---|---|---|---|
| 1 | safety | yes | $0.116 | $0.012 |
| 2 | safety | yes | $0.157 | $0.012 |
| 3 | safety | no | $0.128 | $0.012 |
| 4 | safety | no | $0.131 | $0.012 |
| 5 | cost | no | $0.118 | $0.011 |
| 6 | safety | yes | $0.136 | $0.014 |
| 7 | safety | no | $0.168 | $0.021 |
| 8 | safety | no | $0.141 | $0.020 |
| 9 | safety | no | $0.149 | $0.020 |

## Inputs for cfo.ai
- Cost of goods per certification: $0.058
- Cost per re-test (e.g. on every model or prompt change): $0.019
- Cost per repair session: $1.377
- Suggested scenarios to model: weekly re-test (4 re-tests/month) plus one certification/month per agent, and the same with a repair session included.
