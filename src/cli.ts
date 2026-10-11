// crashworthy CLI
//   crash run      [--split visible|hidden|all] [--only S05,S06] [--repeats N] [--agent versions/v3] [--label txt]
//   crash heal     [--rounds N] [--repeats N] [--commit] [--cost-round N] [--fixer llm|claude-code]
//   crash mutate   [--agent dir] [--only M01,M02]
//   crash verify   <runId>        read every trace of a saved run back from neatlogs and audit it
//   crash whoami                  check the neatlogs read credential and project
//   crash models                  list models on the LiteLLM proxy
//   crash report                  build the rating certificate site in site/
//   crash economics               unit costs from real runs (neatlogs) for the cfo.ai plan -> docs/economics.md
//   crash shots                   screenshots of the report for #neatHack posts -> site/shots/

import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { SCENARIOS } from "./scenarios/index.js";
import { runSuite, type SuiteRun } from "./runner.js";
import { liteLLM, listModels } from "./llm.js";
import { loadAgent, ROOT } from "./versions.js";
import { startTelemetry, stopTelemetry } from "./telemetry.js";
import { NeatlogsReader } from "./readback.js";
import { heal, saveHealLog } from "./fixer/heal.js";
import { mutationTest } from "./mutants.js";
import { pct, usd } from "./fixer/gate.js";
import { starString } from "./score.js";
import { verifyRun } from "./verify.js";
import { buildReport } from "./report.js";
import { economics } from "./economics.js";
import { screenshots } from "./shots.js";

const RUNS = path.join(ROOT, "runs");
const agentModel = () => process.env.CW_AGENT_MODEL ?? "claude-haiku-4-5";
const fixerModel = () => process.env.CW_FIXER_MODEL ?? "claude-sonnet-4-5";

async function save(run: SuiteRun) {
  await mkdir(RUNS, { recursive: true });
  await writeFile(path.join(RUNS, `${run.runId}.json`), JSON.stringify(run, null, 2));
}

export async function loadRun(id: string): Promise<SuiteRun> {
  return JSON.parse(await readFile(path.join(RUNS, id.endsWith(".json") ? id : `${id}.json`), "utf8"));
}

function printRun(run: SuiteRun) {
  console.log(`\n${run.label}  (${run.runId}, agent ${run.agentVersion}, model ${run.model})`);
  for (const s of run.scenarios) {
    const failed = s.checks.filter((c) => !c.pass);
    console.log(`  ${s.pass ? "PASS" : "FAIL"}  ${s.severity} ${s.split === "hidden" ? "[hidden] " : ""}${s.id.padEnd(30)} ${s.infraError ? `infra error: ${s.infraError}` : failed.map((c) => `${c.rule} → ${c.detail}`).join(" | ")}`);
  }
  const m = run.summary;
  console.log(`\n  ${starString(m.stars)}  visible ${pct(m.visible)} · hidden ${pct(m.hidden)} · ${m.passed}/${m.total} pass · ${usd(m.costPerTaskUSD)}/task · ${Math.round(m.tokensPerTask)} tokens/task${m.cappedBy ? ` · capped by ${m.cappedBy}` : ""}`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      split: { type: "string", default: "all" },
      only: { type: "string" },
      repeats: { type: "string", default: "1" },
      agent: { type: "string" },
      label: { type: "string" },
      rounds: { type: "string", default: "5" },
      commit: { type: "boolean", default: false },
      concurrency: { type: "string", default: "4" },
      "cost-round": { type: "string" },
      fixer: { type: "string", default: "llm" },
    },
  });

  switch (cmd) {
    case "whoami": {
      const r = new NeatlogsReader();
      const w = await r.whoami();
      console.log(JSON.stringify({ host: r.host, actor: w.actor, credential: { kind: w.credential.kind, scopes: w.credential.scopes, serviceAccountId: w.credential.serviceAccountId }, organizationId: w.context.organizationId, projectId: w.context.projectId }, null, 2));
      const t = await r.listTraces({ maxPages: 1 });
      console.log(`listTraces ok: ${t.traces.length} trace(s) on the first page`);
      return;
    }
    case "models":
      console.log((await listModels()).join("\n"));
      return;
    case "run": {
      await startTelemetry("crash-dummy");
      const agent = await loadAgent(values.agent ? path.resolve(values.agent) : undefined);
      const only = values.only?.split(",");
      const scenarios = SCENARIOS.filter((s) => (values.split === "all" || s.split === values.split) && (!only || only.some((o) => s.id.startsWith(o))));
      const run = await runSuite({
        scenarios,
        agent,
        llm: liteLLM(),
        model: agentModel(),
        label: values.label ?? `run ${agent.version}`,
        repeats: Number(values.repeats),
        concurrency: Number(values.concurrency),
        onResult: (r) => console.log(`  ${r.pass ? "pass" : "FAIL"} ${r.id} #${r.repeat} trace ${r.traceId}`),
      });
      await save(run);
      printRun(run);
      await stopTelemetry();
      console.log(`\nSaved runs/${run.runId}.json. Verify persistence with: pnpm crash verify ${run.runId}`);
      return;
    }
    case "verify": {
      const run = await loadRun(positionals[0] ?? (await latestRun()));
      const report = await verifyRun(run, new NeatlogsReader(), console.log);
      await mkdir(path.join(RUNS, "verify"), { recursive: true });
      await writeFile(path.join(RUNS, "verify", `${run.runId}.json`), JSON.stringify(report, null, 2));
      console.log(`\n${report.ok}/${report.total} traces verified in neatlogs. Saved runs/verify/${run.runId}.json`);
      if (report.ok !== report.total) process.exitCode = 1;
      return;
    }
    case "heal": {
      await startTelemetry("crash-dummy");
      const log = await heal({
        llm: liteLLM(),
        agentModel: agentModel(),
        fixerModel: fixerModel(),
        rounds: Number(values.rounds),
        repeats: Number(values.repeats),
        commit: values.commit,
        log: console.log,
        save,
        costCapUSD: process.env.CW_COST_CAP ? Number(process.env.CW_COST_CAP) : undefined,
        costRound: values["cost-round"] ? Number(values["cost-round"]) : undefined,
        fixer: values.fixer === "claude-code" ? "claude-code" : "llm",
      });
      const f = await saveHealLog(log);
      await stopTelemetry();
      console.log(`\nHeal log: ${path.relative(ROOT, f)}. Final agent: ${log.finalVersion} (run ${log.finalRunId}).`);
      return;
    }
    case "mutate": {
      await startTelemetry("crash-dummy");
      const agent = await loadAgent(values.agent ? path.resolve(values.agent) : undefined);
      const res = await mutationTest({ agent, scenarios: SCENARIOS, llm: liteLLM(), model: agentModel(), only: values.only?.split(","), log: console.log, save });
      await writeFile(
        path.join(RUNS, `mutation_${res.baseline.runId}.json`),
        JSON.stringify({ agent: agent.version, baselineRunId: res.baseline.runId, strength: res.strength, mutants: res.mutants.map((m) => ({ ...m.mutant, caught: m.caught, caughtBy: m.caughtBy, runId: m.run.runId })) }, null, 2),
      );
      await stopTelemetry();
      console.log(`\nSuite strength: ${res.mutants.filter((m) => m.caught).length}/${res.mutants.length} planted bugs caught.`);
      return;
    }
    case "economics": {
      const out = await economics(console.log);
      console.log(`Written to ${path.relative(ROOT, out)}`);
      return;
    }
    case "shots": {
      const files = await screenshots();
      console.log(files.map((f) => path.relative(ROOT, f)).join("\n"));
      return;
    }
    case "report": {
      const out = await buildReport();
      console.log(`Report written to ${path.relative(ROOT, out)}`);
      return;
    }
    default:
      console.log("usage: crash <run|heal|mutate|verify|whoami|models|report|economics|shots> [options]");
      process.exitCode = cmd ? 1 : 0;
  }
}

async function latestRun() {
  const files = (await readdir(RUNS)).filter((f) => f.startsWith("run_")).sort();
  if (!files.length) throw new Error("no saved runs");
  return files.at(-1)!;
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await stopTelemetry();
  process.exit(1);
});
