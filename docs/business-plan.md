# Crashworthy business plan

Built with **cfo.ai** (Ari) for neatHack 2026. cfo.ai's exported assumptions workbook is [`cfo-ai-assumptions.xlsx`](cfo-ai-assumptions.xlsx) ("Main Scenario"). The cost inputs are the real unit costs measured in our runs ([`economics.md`](economics.md)). Growth, hosting and opening cash are founder assumptions.

## Product and pricing (per AI agent, monthly)
| Plan | Price | Mix | Includes | Delivery cost / agent (cfo.ai) | Gross profit / agent |
|---|---|---|---|---|---|
| Starter | $49 | 70% | ~4.33 re-tests (weekly) + 1 certificate | $0.140 | $48.86 |
| Pro | $199 | 30% | Starter + 2 repair sessions | $2.900 | $196.10 |

Blended: **$94.00 revenue** and **$0.968 delivery cost** per agent per month, a **99.0% gross margin**.

## Assumptions (from the cfo.ai export)
| Input | Value | Source |
|---|---|---|
| Re-test cost (cheap model) | $0.019 | measured (`economics.md`) |
| Re-test cost (larger model, e.g. Claude Haiku) | $0.36 | measured agent cost × test count; share set to 0% in this scenario |
| Certification cost | $0.058 | measured |
| Repair session cost | $1.38 | measured (9 Claude Code rounds) |
| Launch month | 3 | assumption |
| Agents at launch | 5 | assumption |
| Net growth | 30% / month | assumption (aggressive) |
| Hosting and tools | $50 / month from month 3 | assumption |
| Opening cash | $0 | assumption (bootstrapped, no salaries) |

Check: cfo.ai's delivery costs match the measured costs exactly. Starter = 4.333 × $0.019 + $0.058 = $0.140. Pro = $0.140 + 2 × $1.38 = $2.900.

## 24-month projection
> Computed by us from the cfo.ai assumptions above (agents = 5 × 1.3^(month−3) from month 3). This is not a cfo.ai export.

| Month | Agents | Revenue | Delivery cost | Hosting | Profit | Cumulative cash |
|---|---|---|---|---|---|---|
| 1–2 | 0 | $0 | $0 | $0 | $0 | $0 |
| 3 | 5 | $470 | $4.84 | $50 | $415 | $415 |
| 6 | 11 | $1,033 | $10.64 | $50 | $972 | $2,678 |
| 12 | 53 | $4,984 | $51.34 | $50 | $4,883 | $19,325 |
| 18 | 256 | $24,057 | $247.83 | $50 | $23,760 | $100,824 |
| 24 | 1,235 | $116,120 | $1,196.20 | $50 | $114,874 | $495,354 |

Total 24-month revenue: about **$502k**. Cash-flow positive from launch month, so with $0 opening cash, runway is not limited by burn in this scenario.

## Honest caveats
- 30% monthly growth sustained for 22 months is optimistic. At 10%/month, month-24 revenue would be about $3.5k.
- No salaries, sales or support costs are modelled yet. These would dominate costs long before model spend does.
- Delivery cost scales with the customer's agent model. On a Claude Haiku–class agent a re-test costs ~$0.36 instead of $0.019, and certification scales similarly (estimated), but gross margin stays around 95% (Starter) to 97% (Pro) at these prices.
- The repair session cost ($1.38) uses the Claude Code fixer's own reported cost; the agent re-tests use provider-reported tokens × published price, cross-checked against neatlogs-stored tokens (100% match).
