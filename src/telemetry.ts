// neatlogs setup. The process exports with NEATLOGS_API_KEY (ingest key);
// without it spans are still created but nothing is sent, and we say so.

import { execSync } from "node:child_process";
import { init, flushAll, shutdown, Client } from "neatlogs";

let started = false;

function gitSha() {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "uncommitted";
  }
}

export async function startTelemetry(workflowName: string) {
  if (started) return;
  started = true;
  if (!process.env.NEATLOGS_API_KEY) console.warn("⚠ NEATLOGS_API_KEY is not set: traces are created locally but NOT exported to neatlogs.");
  await init({
    workflowName,
    tags: ["crashworthy", "neathack"],
    metadata: { "service.version": gitSha(), "deployment.environment": process.env.CW_ENV ?? "local" },
  });
}

/** The fixer's own reasoning is traced as a separate workflow. */
export function fixerClient() {
  return new Client({ workflowName: "crashworthy-fixer", tags: ["crashworthy", "neathack", "fixer"], disableExport: !process.env.NEATLOGS_API_KEY });
}

export async function stopTelemetry() {
  try {
    await flushAll(15_000);
    await shutdown("crashworthy exit", 15_000);
  } catch (e) {
    console.warn(`neatlogs flush failed (app results unaffected): ${(e as Error).message}`);
  }
}
