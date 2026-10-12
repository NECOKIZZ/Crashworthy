// Unit economics from real runs, for the cfo.ai business plan. Costs come from
// neatlogs (stored totalCostUsd per trace) when a read token is available, and
// otherwise from provider-reported tokens × the price table, labelled as such.

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./versions.js";
import type { SuiteRun } from "./runner.js";
import { NeatlogsReader } from "./readback.js";
import { costUSD } from "./llm.js";
import { loadHealChain } from "./healchain.js";

const RUNS = path.join(ROOT, "runs");
const read = async <T>(f: string): Promise<T> => JSON.parse(await readFile(path.join(RUNS, f), "utf8"));

interface RunCost {
  runId: string;
  label: string;
  traces: number;
  /** Provider-reported tokens × the published price table. */
  localUSD: number | null;
  tokens: number;
  /** Cross-check against neatlogs: traces found, their stored tokens, their stored cost. */
  neatlogs: { found: number; tokens: number; tokensForFound: number; usd: number } | null;
}

async function runCost(run: SuiteRun, reader: NeatlogsReader | null): Promise<RunCost> {
  const all = run.scenarios.flatMap((s) => s.runs);
  let neatlogs: RunCost["neatlogs"] = null;
  if (reader) {
    neatlogs = { found: 0, tokens: 0, tokensForFound: 0, usd: 0 };
    for (const r of all) {
      const t = r.traceId ? await reader.getTrace(r.traceId).catch(() => null) : null;
      if (!t) continue;
      neatlogs.found += 1;
      neatlogs.tokens += t.totalTokens ?? 0;
      neatlogs.tokensForFound += r.usage.input + r.usage.output;
      neatlogs.usd += t.totalCostUsd ?? 0;
    }
  }
  const local = all.some((r) => r.costUSD == null) ? null : all.reduce((n, r) => n + (r.costUSD ?? 0), 0);
  return { runId: run.runId, label: run.label, traces: all.length, localUSD: local, tokens: all.reduce((n, r) => n + r.usage.input + r.usage.output, 0), neatlogs };
}

export async function economics(log: (s: string) => void, opts: { after?: string } = {}) {
  const files = (await readdir(RUNS)).sort();
  const reader = NeatlogsReader.available() ? new NeatlogsReader() : null;
  const mutFile = files.filter((f) => f.startsWith("mutation_")).at(-1);
  const heal = await loadHealChain(RUNS);
  if (!heal) throw new Error("Run `pnpm crash heal` first.");

  const final = await runCost(await read<SuiteRun>(`${opts.after ?? heal.finalRunId}.json`), reader);
  const rounds = [];
  for (const r of heal.rounds) {
    const run = r.afterRunId ? await runCost(await read<SuiteRun>(`${r.afterRunId}.json`), reader) : null;
    // Claude Code fixer: the cost the session itself reports. LLM fixer: tokens × price table.
    const fixer: number | null = r.fixerCostUSD ?? (r.fixer !== "claude-code" && r.fixerUsage && !r.fixerUsage.unknown ? costUSD(heal.fixerModel, r.fixerUsage) : null);
    rounds.push({ round: r.round, mode: r.mode, kept: r.decision.accept, fixerUSD: fixer, rerun: run });
  }
  let mutation: { runs: RunCost[]; total: number | null } | null = null;
  if (mutFile) {
    const m = await read<{ baselineRunId: string; mutants: { runId: string }[] }>(mutFile);
    const runs = await Promise.all(m.mutants.map(async (x) => runCost(await read<SuiteRun>(`${x.runId}.json`), reader)));
    mutation = { runs, total: sum(runs.map(best)) };
  }

  const retest = best(final);
  const perTest = retest != null ? retest / final.traces : null;
  const healTotal = sum(rounds.map((r) => (r.rerun ? sum([best(r.rerun), r.fixerUSD]) : r.fixerUSD)));
  const certification = sum([retest, mutation?.total ?? null]);
  const checked = [final, ...rounds.map((r) => r.rerun), ...(mutation?.runs ?? [])].filter((r): r is RunCost => !!r?.neatlogs);
  const found = checked.reduce((n, r) => n + r.neatlogs!.found, 0);
  const traces = checked.reduce((n, r) => n + r.traces, 0);
  const stored = checked.reduce((n, r) => n + r.neatlogs!.tokens, 0);
  const local = checked.reduce((n, r) => n + r.neatlogs!.tokensForFound, 0);
  const nlUSD = checked.reduce((n, r) => n + r.neatlogs!.usd, 0);
  const source = `agent: provider-reported tokens × the published price for \`${heal.agentModel}\`; fixer: the cost each Claude Code session reported`;
  const crossCheck = checked.length
    ? `neatlogs cross-check: ${found}/${traces} traces found; stored tokens ${stored.toLocaleString("en-US")} vs local ${local.toLocaleString("en-US")} for those traces (${local ? ((stored / local) * 100).toFixed(1) : "n/a"}%); stored cost $${nlUSD.toFixed(4)}${nlUSD === 0 ? " (neatlogs has no price for this model, so token counts are the check)" : ""}.`
    : "neatlogs cross-check: not run (no read credential).";

  const md = `# Unit economics (from real runs)

Source of costs: **${source}**.

${crossCheck} Agent model \`${heal.agentModel}\`, fixer model \`${heal.fixerModel}\`. Generated ${new Date().toISOString()} by \`pnpm crash economics\`.

| What | Cost (USD) | Basis |
|---|---|---|
| One crash test (one scenario run) | ${f(perTest)} | final run ${final.runId}, ${final.traces} traces |
| One full re-test (all ${final.traces} tests) | ${f(retest)} | final run |
| Planted-bug check (all mutants) | ${f(mutation?.total ?? null)} | ${mutation ? `${mutation.runs.length} mutant runs` : "not run"} |
| **One certification** (full re-test + planted bugs) | **${f(certification)}** | sum of the two above |
| One repair round (fixer + full re-test) | ${f(rounds.length ? (healTotal ?? 0) / rounds.length : null)} | average of ${rounds.length} rounds |
| Whole repair session | ${f(healTotal)} | ${rounds.length} rounds, ${rounds.filter((r) => r.kept).length} kept |

## Per round
| Round | Mode | Kept | Fixer | Re-test |
|---|---|---|---|---|
${rounds.map((r) => `| ${r.round} | ${r.mode} | ${r.kept ? "yes" : "no"} | ${f(r.fixerUSD)} | ${f(r.rerun ? best(r.rerun) : null)} |`).join("\n")}

## Inputs for cfo.ai
- Cost of goods per certification: ${f(certification)}
- Cost per re-test (e.g. on every model or prompt change): ${f(retest)}
- Cost per repair session: ${f(healTotal)}
- Suggested scenarios to model: weekly re-test (4 re-tests/month) plus one certification/month per agent, and the same with a repair session included.
`;
  await mkdir(path.join(ROOT, "docs"), { recursive: true });
  const out = path.join(ROOT, "docs", "economics.md");
  await writeFile(out, md);
  log(md);
  return out;
}

const best = (r: RunCost) => r.localUSD;
function sum(xs: (number | null)[]) {
  return xs.some((x) => x == null) ? null : xs.reduce<number>((a, b) => a + (b ?? 0), 0);
}
const f = (x: number | null) => (x == null ? "unknown" : `$${x < 0.01 ? x.toFixed(5) : x.toFixed(3)}`);
