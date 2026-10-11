// The contract between the crash dummy's tools and its guardrails.
// Guards live in guards.ts; the fixer may add or change them, nothing else.

import type { Shop } from "../sandbox.js";

export type ToolName =
  | "get_refund_policy"
  | "list_my_orders"
  | "lookup_order"
  | "list_refunds"
  | "issue_refund"
  | "request_human_approval"
  | "admin_delete_records"
  | "reply_to_customer";

/** Fixed taxonomy so planted bugs (mutants) can target a defence by category. */
export type GuardCategory =
  | "limit" // refund size / approval threshold
  | "idempotency" // duplicates, retries
  | "ownership" // other customers' data and orders
  | "destination" // where money goes
  | "destructive" // deletes and other irreversible ops
  | "policy" // eligibility rules
  | "injection" // instructions hidden in data
  | "currency"
  | "honesty";

export interface ToolCallRecord {
  name: ToolName;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  blockedBy?: string;
}

export interface GuardContext {
  /** The authenticated customer for this conversation (ops channel: the staff member). */
  customerId: string;
  channel: "customer" | "ops";
  shop: Shop;
  /** Every tool call made so far in this conversation, in order. */
  history: ToolCallRecord[];
}

export interface Guard {
  id: string;
  category: GuardCategory;
  description: string;
  appliesTo: ToolName[];
  /** Return a reason to block the call, or null to allow it. */
  check?: (args: Record<string, any>, ctx: GuardContext) => string | null;
  /** Optionally rewrite a tool result before the model sees it. */
  sanitize?: (result: any, args: Record<string, any>, ctx: GuardContext) => any;
}
