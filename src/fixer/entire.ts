// Entire integration: every repair is made by an Entire-tracked Claude Code
// session, located with Entire Graph, committed (kept or rolled back) so the
// checkpoint links the neatlogs evidence to the exact change and its reasoning.
//
// The hidden test set stays hidden: Graph results from test, scenario, run and
// doc files are filtered out before the fixer sees them, and the Claude Code
// fixer runs with deny rules for those paths and may edit only the agent.

import { execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../versions.js";
import type { Usage } from "../llm.js";

/** Paths the fixer must never see: they would reveal the tests or the held-out set. */
export const OFF_LIMITS = ["src/scenarios/", "test/", "runs/", "versions/", "site/", "docs/", "fixer-briefs/", "README.md", "hackathon.md", "HANDOFF.md", "src/mutants.ts"];
const offLimits = (p: string) => OFF_LIMITS.some((x) => (x.endsWith("/") ? p.startsWith(x) : p === x));
/** Graph results are limited to the agent under test and its sandbox: the fixer works on the agent, not the harness. */
const AGENT_CODE = ["src/dummy/", "src/sandbox.ts"];
const isAgentCode = (p: string) => AGENT_CODE.some((x) => (x.endsWith("/") ? p.startsWith(x) : p === x));

function entireBin() {
  return process.env.CW_ENTIRE_BIN ?? "entire";
}

export function entireAvailable() {
  try {
    execFileSync(entireBin(), ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export interface GraphHit {
  file: string;
  line: number;
  symbol?: string;
  snippet: string;
}

/** Entire Graph: plain-language → ranked code locations, with off-limits files removed. */
export function graphLocate(query: string, topK = 8): GraphHit[] {
  try {
    const out = execFileSync(entireBin(), ["graph", "search", "--query", query, "--repo", ROOT, "--top-k", String(topK + 6), "--profile", "full", "--format", "json"], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 20 * 1024 * 1024,
      timeout: 120_000,
    }).toString();
    const body = JSON.parse(out) as { results: { file_path: string; start_line: number; qualified_name?: string; snippet?: string }[] };
    return body.results
      .filter((r) => isAgentCode(r.file_path) && !offLimits(r.file_path))
      .slice(0, topK)
      .map((r) => ({ file: r.file_path, line: r.start_line, symbol: r.qualified_name, snippet: (r.snippet ?? "").slice(0, 900) }));
  } catch {
    return [];
  }
}

export function formatHits(hits: GraphHit[]) {
  return hits.map((h) => `- ${h.file}:${h.line}${h.symbol ? ` (${h.symbol})` : ""}\n\`\`\`ts\n${h.snippet}\n\`\`\``).join("\n");
}

export interface ClaudeFix {
  root_cause: string;
  target_scenarios: string[];
  change_type: "prompt" | "guard";
  summary: string;
  usage: Usage;
  costUSD: number | null;
  sessionId?: string;
  briefPath: string;
}

/**
 * Run one repair as a headless Claude Code session inside the repo. Entire's
 * hooks record it; it may edit only src/dummy/prompt.md and src/dummy/guards.ts.
 */
export async function claudeCodeFix(opts: { round: number; candidate: string; brief: string; log: (s: string) => void }): Promise<ClaudeFix> {
  const dir = path.join(ROOT, "fixer-briefs");
  await mkdir(dir, { recursive: true });
  const briefPath = path.join(dir, `round-${String(opts.round).padStart(2, "0")}-${opts.candidate}.md`);
  await writeFile(briefPath, opts.brief);
  const rel = path.relative(ROOT, briefPath);
  const prompt = `You are the Crashworthy fixer. Read the repair brief at ${rel} with the Read tool and follow it exactly.
Make ONE change: either edit src/dummy/prompt.md, or add/modify ONE guard in src/dummy/guards.ts. You cannot edit anything else.
After editing, run: npx tsc --noEmit
Finish with a single line of JSON and nothing after it:
{"root_cause":"...","target_scenarios":["..."],"change_type":"prompt"|"guard","summary":"one sentence"}`;
  const deny = [...OFF_LIMITS.filter((p) => p !== "fixer-briefs/").map((p) => `Read(./${p}${p.endsWith("/") ? "**" : ""})`), "Bash(git:*)", "WebFetch", "WebSearch"];
  const args = [
    "-p",
    prompt,
    "--output-format",
    "json",
    "--permission-mode",
    "dontAsk",
    "--allowedTools",
    "Read,Edit(./src/dummy/prompt.md),Edit(./src/dummy/guards.ts),Bash(npx tsc:*)",
    "--disallowedTools",
    deny.join(","),
  ];
  // A fresh session per round, so its Entire checkpoint holds only the fixer's own transcript
  // (inside another Claude Code session the child would otherwise inherit the parent's id).
  args.push("--session-id", randomUUID());
  if (process.env.CW_CLAUDE_MODEL) args.push("--model", process.env.CW_CLAUDE_MODEL);
  const env = { ...process.env };
  for (const k of ["NEATLOGS_API_KEY", "NEATLOGS_TOKEN", "LITELLM_API_KEY", "CW_NEATLOGS_PROFILE"]) delete env[k];
  const stdout = await new Promise<string>((resolve, reject) =>
    execFile(process.env.CW_CLAUDE_BIN ?? "claude", args, { cwd: ROOT, env, maxBuffer: 50 * 1024 * 1024, timeout: 15 * 60_000 }, (err, out) =>
      err && !out ? reject(new Error(`claude fixer failed: ${err.message}`)) : resolve(out),
    ),
  );
  const res = JSON.parse(stdout) as { result?: string; total_cost_usd?: number; session_id?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } };
  const text = res.result ?? "";
  const line = text.trim().split("\n").reverse().find((l) => l.trim().startsWith("{"));
  if (!line) throw new Error(`claude fixer gave no JSON summary: ${text.slice(-300)}`);
  const p = JSON.parse(line) as Omit<ClaudeFix, "usage" | "costUSD" | "briefPath">;
  const u = res.usage ?? {};
  return {
    ...p,
    usage: { input: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), output: u.output_tokens ?? 0 },
    costUSD: res.total_cost_usd ?? null,
    sessionId: res.session_id,
    briefPath: rel,
  };
}

export interface CheckpointLink {
  checkpointId?: string;
  commit: string;
  url: string;
  /** Entity-level change list from `entire graph checkpoint`. */
  changes: string[];
}

/** Read the Entire-Checkpoint trailer of a commit and analyze it with Graph. */
export function checkpointFor(commit: string): CheckpointLink {
  const full = execFileSync("git", ["rev-parse", commit], { cwd: ROOT }).toString().trim();
  const msg = execFileSync("git", ["log", "-1", "--format=%B", full], { cwd: ROOT }).toString();
  const checkpointId = msg.match(/^Entire-Checkpoint:\s*(\S+)/m)?.[1];
  const remote = repoSlug();
  const link: CheckpointLink = { checkpointId, commit: full, url: remote ? `https://entire.io/gh/${remote}/commit/${full}` : "", changes: [] };
  if (checkpointId) {
    try {
      const out = execFileSync(entireBin(), ["graph", "checkpoint", checkpointId, "--json", "--repo", ROOT], { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"], timeout: 120_000 }).toString();
      const d = JSON.parse(out) as { files: { path: string; changes: { type: string; kind: string; name: string; dependents_count?: number }[] }[] };
      // Only the agent's code: briefs, run JSON and snapshots are bookkeeping.
      link.changes = d.files
        .filter((f) => f.path.startsWith("src/"))
        .flatMap((f) => f.changes.map((c) => `${f.path}: ${c.type} ${c.kind} ${c.name}${c.dependents_count ? ` (${c.dependents_count} dependents)` : ""}`));
    } catch {}
  }
  return link;
}

function repoSlug() {
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], { cwd: ROOT }).toString().trim();
    return url.match(/github\.com[/:]([^/]+\/[^/.]+)/)?.[1];
  } catch {
    return undefined;
  }
}
