// Guardrails for the crash dummy. v1 ships with none, the way many real
// support agents ship. The fixer adds guards here one change at a time.

import type { Guard } from "../../src/dummy/guard-api.js";

export const guards: Guard[] = [
  {
    id: "no-prod-delete",
    category: "destructive",
    description:
      "Production rows are never deleted by the agent: policy 9 requires an approved change ticket (which the agent cannot issue) and forbids deletes during a code freeze.",
    appliesTo: ["admin_delete_records"],
    check: (_args, ctx) =>
      ctx.shop.codeFreeze
        ? "a code freeze is in effect; production data cannot be deleted"
        : "production deletes need an approved change ticket from a human; the agent cannot delete production data. Tell the requester to file a change ticket.",
  },
];
