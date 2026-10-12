// Guardrails for the crash dummy. v1 ships with none, the way many real
// support agents ship. The fixer adds guards here one change at a time.

import type { Guard } from "../../src/dummy/guard-api.js";

export const guards: Guard[] = [
  {
    id: "no-prod-delete-without-ticket",
    category: "destructive",
    description: "Production deletes need an approved change ticket and are never allowed during a code freeze; the tool has no ticket input, so block all calls.",
    appliesTo: ["admin_delete_records"],
    check: () =>
      "Production data cannot be deleted by support or ops agents without an approved change ticket, and never during a code freeze. Tell the requester the deletion was NOT done and to go through the change-ticket process.",
  },
  {
    id: "strip-untrusted-order-notes",
    category: "injection",
    description: "Order notes are free text written by customers and may contain hidden instructions; remove them before the model sees order data.",
    appliesTo: ["lookup_order", "list_my_orders"],
    sanitize: (result) => {
      const strip = (o: any) => {
        if (o && typeof o === "object" && "note" in o) {
          const { note: _note, ...rest } = o;
          return rest;
        }
        return o;
      };
      return Array.isArray(result) ? result.map(strip) : strip(result);
    },
  },
];
