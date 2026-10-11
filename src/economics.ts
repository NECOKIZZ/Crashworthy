// Unit economics from real runs, for the cfo.ai business plan. Costs come from
// neatlogs (stored totalCostUsd per trace) when a read token is available, and
// otherwise from provider-reported tokens × the price table, labelled as such.

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./versions.js";
import type { SuiteRun } from "./runner.js";
import type { HealLog } from "./fixer/heal.js";
import { NeatlogsReader } from "./readback.js";
import { costUSD } from "./llm.js";

const RUNS = path.join(ROOT, "runs");
const read = async <T>(f: string): Promise<T> => JSON.parse(await readFile(path.join(RUNS, f), "utf8"));

interface RunCost {
  runId: string;
  label: string;
  traces: number;
  neatlogsUSD: number | null;
  localUSD: number | null;
  tokens: number;
}

async function runCost(run: SuiteRun, reader: NeatlogsReader | null): Promise<RunCost> {
  const all = run.scenarios.flatMap((s) => s.runs);
  let neatlogs: number | null = reader ? 0 : null;
  if (reader) {
    for (const r of all) {
      try {
        if (!r.traceId) throw new Error("no trace id");
        neatlogs! += (await reader.getTrace(r.traceId)).totalCostUsd;
      } catch {
        neatlogs = null;
        break;
      }
    }
  }
  const local = all.some((r) => r.costUSD == null) ? null : all.reduce((n, r) => n + (r.costUSD ?? 0), 0);
  return { runId: run.runId, label: run.label, traces: all.length, neatlogsUSD: neatlogs, localUSD: local, tokens: all.reduce((n, r) => n + r.usage.input + r.usage.output, 0) };
}

export async function economics(log: (s: string) => void) {
  const files = (await readdir(RUNS)).sort();
  const reader = NeatlogsReader.available() ? new NeatlogsReader() : null;
  const healFile = files.filter((f) => f.startsWith("heal_")).at(-1);
  const mutFile = files.filter((f) => f.startsWith("mutation_")).at(-1);
  if (!healFile) throw new Error("Run `pnpm crash heal` first.");
  const heal = await read<HealLog>(healFile);

  const final = await runCost(await read<SuiteRun>(`${heal.finalRunId}.json`), reader);
  const rounds = [];
  for (const r of heal.rounds) {
    const run = r.afterRunId ? await runCost(await read<SuiteRun>(`${r.afterRunId}.json`), reader) : null;
    let fixer: number | null = r.fixerUsage && !r.fixerUsage.unknown ? costUSD(heal.fixerModel, r.fixerUsage) : null;
    if (reader && r.fixerTraceId) fixer = (await reader.getTrace(r.fixerTraceId).catch(() => null))?.totalCostUsd ?? fixer;
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
  const source = reader ? "neatlogs stored trace cost (totalCostUsd)" : "provider-reported tokens × price table (no NEATLOGS_TOKEN)";

  const md = `# Unit economics (from real runs)

Source of costs: **${source}**. Agent model \`${heal.agentModel}\`, fixer model \`${heal.fixerModel}\`. Generated ${new Date().toISOString()} by \`pnpm crash economics\`.

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

const best = (r: RunCost) => r.neatlogsUSD ?? r.localUSD;
function sum(xs: (number | null)[]) {
  return xs.some((x) => x == null) ? null : xs.reduce<number>((a, b) => a + (b ?? 0), 0);
}
const f = (x: number | null) => (x == null ? "unknown" : `$${x < 0.01 ? x.toFixed(5) : x.toFixed(3)}`);
