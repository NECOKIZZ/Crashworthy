// Runs crash tests against an agent version. Each scenario repetition is one
// neatlogs trace: a WORKFLOW root (session = run + scenario) with the agent's
// turns, tool calls and an EVALUATOR span holding the verdict.

import { randomUUID } from "node:crypto";
import { trace, setTraceOutput } from "neatlogs";
import { converse, type AgentConfig } from "./dummy/agent.js";
import { costUSD, type ChatClient, type Usage } from "./llm.js";
import { Shop } from "./sandbox.js";
import type { Scenario } from "./scenarios/types.js";
import { stars, weightedScore } from "./score.js";

export interface CheckOutcome {
  rule: string;
  pass: boolean;
  detail?: string;
}

export interface ScenarioRun {
  id: string;
  name: string;
  severity: Scenario["severity"];
  split: Scenario["split"];
  repeat: number;
  pass: boolean;
  checks: CheckOutcome[];
  usage: Usage;
  costUSD: number | null;
  llmCalls: number;
  toolCalls: { name: string; args: unknown; error?: string; blockedBy?: string }[];
  replies: string[];
  traceId?: string;
  sessionId: string;
  durationMs: number;
  /** Infrastructure failure (model/API error), not an agent verdict. */
  infraError?: string;
}

export interface SuiteRun {
  runId: string;
  label: string;
  agentVersion: string;
  model: string;
  startedAt: string;
  finishedAt: string;
  repeats: number;
  /** One entry per scenario: passes only if every repetition passed (worst of N). */
  scenarios: (Omit<ScenarioRun, "repeat"> & { runs: ScenarioRun[] })[];
  summary: SuiteSummary;
}

export interface SuiteSummary {
  visible: number;
  hidden: number | null;
  overall: number;
  stars: number;
  cappedBy?: string;
  passed: number;
  total: number;
  costPerTaskUSD: number | null;
  tokensPerTask: number;
  llmCallsPerTask: number;
  infraErrors: number;
}

export async function runScenario(
  s: Scenario,
  agent: AgentConfig,
  llm: ChatClient,
  model: string,
  meta: { runId: string; label: string; repeat: number },
): Promise<ScenarioRun> {
  const sessionId = `${meta.runId}:${s.id}:${meta.repeat}`;
  const started = Date.now();
  return trace(
    {
      name: `crash-test ${s.id}`,
      kind: "WORKFLOW",
      sessionId,
      sessionFeatureName: "crash-test",
      sessionEntryPoint: "crashworthy run",
      endUserId: s.actor,
      input: { scenario: s.id, turns: s.turns },
      attributes: {
        "crashworthy.run_id": meta.runId,
        "crashworthy.label": meta.label,
        "crashworthy.scenario": s.id,
        "crashworthy.split": s.split,
        "crashworthy.severity": s.severity,
        "crashworthy.agent_version": agent.version,
        "crashworthy.repeat": meta.repeat,
        "crashworthy.model": model,
        "input.mime_type": "application/json",
      },
    },
    async (root) => {
      const tid = root.spanContext().traceId;
      // An all-zero id means the span was not recorded (export disabled).
      const traceId = /^0+$/.test(tid) ? undefined : tid;
      const shop = new Shop(s.seed);
      const base = { id: s.id, name: s.name, severity: s.severity, split: s.split, repeat: meta.repeat, sessionId, traceId };
      let convo;
      try {
        convo = await converse({ llm, model, agent, shop, customerId: s.actor, channel: s.channel, turns: s.turns });
      } catch (e) {
        const msg = (e as Error).message;
        root.setStatus({ code: 2, message: msg });
        return { ...base, pass: false, checks: [], usage: { input: 0, output: 0, unknown: true }, costUSD: null, llmCalls: 0, toolCalls: [], replies: [], durationMs: Date.now() - started, infraError: msg };
      }
      const text = convo.replies.map((r) => r.message).join("\n");
      const checks = await trace({ name: "crash-test verdict", kind: "EVALUATOR", input: { rules: s.checks.map((c) => c.rule) } }, async (span) => {
        const out: CheckOutcome[] = s.checks.map((c) => {
          try {
            const r = c.test({ shop, convo, text });
            return r === true ? { rule: c.rule, pass: true } : { rule: c.rule, pass: false, detail: r };
          } catch (e) {
            return { rule: c.rule, pass: false, detail: `check crashed: ${(e as Error).message}` };
          }
        });
        span.setAttribute("output.value", JSON.stringify(out));
        span.setAttribute("output.mime_type", "application/json");
        span.setAttribute("crashworthy.pass", out.every((c) => c.pass));
        return out;
      });
      const pass = checks.every((c) => c.pass);
      root.setAttribute("crashworthy.pass", pass);
      if (!pass) root.setAttribute("crashworthy.failed_rules", checks.filter((c) => !c.pass).map((c) => c.rule).join(" | "));
      setTraceOutput({ pass, failed: checks.filter((c) => !c.pass) });
      return {
        ...base,
        pass,
        checks,
        usage: convo.usage,
        costUSD: costUSD(model, convo.usage),
        llmCalls: convo.llmCalls,
        toolCalls: convo.toolCalls.map((t) => ({ name: t.name, args: t.args, error: t.error, blockedBy: t.blockedBy })),
        replies: convo.replies.map((r) => r.message),
        durationMs: Date.now() - started,
      };
    },
  );
}

export async function runSuite(opts: {
  scenarios: Scenario[];
  agent: AgentConfig;
  llm: ChatClient;
  model: string;
  label: string;
  repeats?: number;
  concurrency?: number;
  runId?: string;
  onResult?: (r: ScenarioRun) => void;
}): Promise<SuiteRun> {
  const runId = opts.runId ?? `run_${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}_${randomUUID().slice(0, 6)}`;
  const repeats = opts.repeats ?? 1;
  const startedAt = new Date().toISOString();
  const jobs = opts.scenarios.flatMap((s) => Array.from({ length: repeats }, (_, i) => ({ s, repeat: i + 1 })));
  const results: ScenarioRun[] = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const r = await runScenario(job.s, opts.agent, opts.llm, opts.model, { runId, label: opts.label, repeat: job.repeat });
      results.push(r);
      opts.onResult?.(r);
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 4, jobs.length) }, worker));

  const scenarios = opts.scenarios.map((s) => {
    const runs = results.filter((r) => r.id === s.id).sort((a, b) => a.repeat - b.repeat);
    const worst = runs.find((r) => !r.pass) ?? runs[0];
    return { ...worst, pass: runs.every((r) => r.pass), runs };
  });
  return { runId, label: opts.label, agentVersion: opts.agent.version, model: opts.model, startedAt, finishedAt: new Date().toISOString(), repeats, scenarios, summary: summarize(scenarios, results) };
}

export function summarize(scenarios: { id: string; severity: Scenario["severity"]; split: Scenario["split"]; pass: boolean }[], runs: ScenarioRun[]): SuiteSummary {
  const vis = scenarios.filter((s) => s.split === "visible");
  const hid = scenarios.filter((s) => s.split === "hidden");
  const st = stars(scenarios);
  const costs = runs.map((r) => r.costUSD);
  const n = Math.max(runs.length, 1);
  return {
    visible: weightedScore(vis),
    hidden: hid.length ? weightedScore(hid) : null,
    overall: weightedScore(scenarios),
    stars: st.stars,
    cappedBy: st.cappedBy,
    passed: scenarios.filter((s) => s.pass).length,
    total: scenarios.length,
    costPerTaskUSD: costs.some((c) => c == null) ? null : costs.reduce<number>((a, b) => a + (b ?? 0), 0) / n,
    tokensPerTask: runs.reduce((a, r) => a + r.usage.input + r.usage.output, 0) / n,
    llmCallsPerTask: runs.reduce((a, r) => a + r.llmCalls, 0) / n,
    infraErrors: runs.filter((r) => r.infraError).length,
  };
}
