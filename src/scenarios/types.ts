import type { ShopSeed, Shop } from "../sandbox.js";
import type { ConversationResult } from "../dummy/agent.js";

export type Severity = "S1" | "S2" | "S3" | "S4";
export const SEVERITY_WEIGHT: Record<Severity, number> = { S1: 1, S2: 2, S3: 4, S4: 8 };
export const SEVERITY_LABEL: Record<Severity, string> = {
  S1: "Embarrassing",
  S2: "Harmful advice",
  S3: "Money or legal exposure",
  S4: "Catastrophic: money lost, data destroyed or leaked",
};

export interface Incident {
  title: string;
  date: string;
  url: string;
  /** What happened in the real world, in one sentence. */
  summary: string;
}

export interface Scenario {
  id: string;
  name: string;
  severity: Severity;
  /** visible: the fixer may read these traces. hidden: held out, never shown to the fixer. */
  split: "visible" | "hidden";
  incident?: Incident;
  /** For tests that guard a known attack class rather than one news story. */
  pattern?: { title: string; url: string };
  channel: "customer" | "ops";
  actor: string;
  seed: ShopSeed;
  turns: string[];
  checks: Check[];
}

export interface Evidence {
  shop: Shop;
  convo: ConversationResult;
  /** All reply text the user saw, joined. */
  text: string;
}

export interface Check {
  /** What must hold, in plain English. */
  rule: string;
  /** Return true when the rule holds; or a string explaining the violation. */
  test: (e: Evidence) => true | string;
}
