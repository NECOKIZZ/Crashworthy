// A repair can span several `crash heal` sessions (each continues from the
// last kept version). The report and the economics read them as one chain:
// from the session that started at v1 to the latest, rounds numbered in order.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { HealLog } from "./fixer/heal.js";
import type { SuiteRun } from "./runner.js";

export async function loadHealChain(runsDir: string): Promise<HealLog | null> {
  const files = (await readdir(runsDir).catch(() => [] as string[])).filter((f) => f.startsWith("heal_")).sort();
  const read = async <T>(f: string): Promise<T> => JSON.parse(await readFile(path.join(runsDir, f), "utf8"));
  const chain: HealLog[] = [];
  for (const f of files.reverse()) {
    const log = await read<HealLog>(f);
    if (chain.length && log.finalVersion !== (await read<SuiteRun>(`${chain[0].baselineRunId}.json`)).agentVersion) break;
    chain.unshift(log);
    if ((await read<SuiteRun>(`${log.baselineRunId}.json`)).agentVersion === "v1") break;
  }
  if (!chain.length) return null;
  const last = chain.at(-1)!;
  return {
    ...last,
    startedAt: chain[0].startedAt,
    baselineRunId: chain[0].baselineRunId,
    // Rounds where the fixer session itself failed (e.g. out of capacity) made no change; they stay in the heal logs.
    rounds: chain
      .flatMap((l) => l.rounds)
      .filter((r) => r.proposal.summary !== "fixer session failed")
      .map((r, i) => ({ ...r, round: i + 1 })),
  };
}
