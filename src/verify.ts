// Audit a saved run against what neatlogs actually persisted: every trace
// must exist, be finalized, and match the local execution (turns, model
// calls, tool calls, guard blocks, verdict, tokens).

import type { SuiteRun, ScenarioRun } from "./runner.js";
import { NeatlogsReader, type SpanRow } from "./readback.js";
import { SCENARIOS } from "./scenarios/index.js";

export interface TraceAudit {
  scenario: string;
  repeat: number;
  traceId?: string;
  sessionId: string;
  ok: boolean;
  problems: string[];
  stored?: { workflowName: string | null; status: string; spans: number; byType: Record<string, number>; llmTokens: number; finalization: string | null; verdictPayload?: string };
  local: { turns: number; llmCalls: number; toolCalls: number; blocked: number; tokens: number; pass: boolean };
}

export async function verifyRun(run: SuiteRun, reader: NeatlogsReader, log: (s: string) => void) {
  const who = await reader.whoami();
  log(`neatlogs ${reader.host} · project ${who.context.projectId} · actor ${who.actor.kind}:${who.actor.id}`);
  const audits: TraceAudit[] = [];
  for (const r of run.scenarios.flatMap((s) => s.runs)) {
    const a = await auditOne(r, reader);
    audits.push(a);
    log(`  ${a.ok ? "OK  " : "BAD "} ${r.id} #${r.repeat} ${r.traceId ?? "-"} ${a.problems.join("; ")}`);
  }
  return { runId: run.runId, host: reader.host, projectId: who.context.projectId, checkedAt: new Date().toISOString(), total: audits.length, ok: audits.filter((a) => a.ok).length, audits };
}

const count = (spans: SpanRow[], type: string) => spans.filter((s) => s.spanType.toUpperCase() === type).length;

async function auditOne(r: ScenarioRun, reader: NeatlogsReader): Promise<TraceAudit> {
  const turns = SCENARIOS.find((s) => s.id === r.id)?.turns.length ?? 0;
  const local = {
    turns,
    llmCalls: r.llmCalls,
    toolCalls: r.toolCalls.length,
    blocked: r.toolCalls.filter((t) => t.blockedBy).length,
    tokens: r.usage.input + r.usage.output,
    pass: r.pass,
  };
  const a: TraceAudit = { scenario: r.id, repeat: r.repeat, traceId: r.traceId, sessionId: r.sessionId, ok: false, problems: [], local };
  if (!r.traceId) {
    a.problems.push("no trace id recorded locally");
    return a;
  }
  try {
    const t = await reader.waitForTrace(r.traceId);
    const { spans, complete } = await reader.listSpans(r.traceId);
    const byType: Record<string, number> = {};
    for (const s of spans) byType[s.spanType.toUpperCase()] = (byType[s.spanType.toUpperCase()] ?? 0) + 1;
    const llmTokens = spans.filter((s) => s.spanType.toUpperCase() === "LLM").reduce((n, s) => n + s.totalTokens, 0);
    a.stored = { workflowName: t.workflowName, status: t.status, spans: spans.length, byType, llmTokens, finalization: t.finalizationStatus };
    if (!complete) a.problems.push("span list truncated at page limit");
    if (t.sessionId !== r.sessionId) a.problems.push(`session ${t.sessionId} ≠ ${r.sessionId}`);
    if (t.workflowName !== "crash-dummy") a.problems.push(`workflow ${t.workflowName}`);
    if (count(spans, "WORKFLOW") !== 1) a.problems.push(`${count(spans, "WORKFLOW")} WORKFLOW roots`);
    if (count(spans, "AGENT") !== turns) a.problems.push(`AGENT spans ${count(spans, "AGENT")} ≠ turns ${turns}`);
    if (count(spans, "LLM") !== r.llmCalls) a.problems.push(`LLM spans ${count(spans, "LLM")} ≠ model calls ${r.llmCalls}`);
    if (count(spans, "TOOL") !== local.toolCalls) a.problems.push(`TOOL spans ${count(spans, "TOOL")} ≠ tool calls ${local.toolCalls}`);
    if (count(spans, "GUARDRAIL") !== local.blocked) a.problems.push(`GUARDRAIL spans ${count(spans, "GUARDRAIL")} ≠ blocks ${local.blocked}`);
    if (count(spans, "EVALUATOR") !== 1) a.problems.push(`${count(spans, "EVALUATOR")} EVALUATOR spans`);
    if (!r.usage.unknown && llmTokens !== local.tokens) a.problems.push(`stored LLM tokens ${llmTokens} ≠ provider-reported ${local.tokens}`);
    const evalSpan = spans.find((s) => s.spanType.toUpperCase() === "EVALUATOR");
    if (evalSpan) {
      const p = await reader.payload(r.traceId, evalSpan.spanId, "output");
      a.stored.verdictPayload = p.output?.value ?? undefined;
      if (!p.output?.available) a.problems.push("verdict payload not available");
      else {
        try {
          const checks = JSON.parse(p.output.value ?? "[]") as { pass: boolean }[];
          if (checks.every((c) => c.pass) !== r.pass) a.problems.push("stored verdict ≠ local verdict");
        } catch {
          a.problems.push(`verdict payload not JSON (${p.output.mimeType}${p.output.truncated ? ", truncated" : ""})`);
        }
      }
    }
  } catch (e) {
    a.problems.push((e as Error).message);
  }
  a.ok = a.problems.length === 0;
  return a;
}
