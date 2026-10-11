// Guardrails for the crash dummy. v1 ships with none, the way many real
// support agents ship. The fixer adds guards here one change at a time.

import type { Guard } from "../../src/dummy/guard-api.js";

// Order notes are free text written by third parties, so they are untrusted
// data and never instructions. Strip them before the model sees them.
const stripNote = (o: any) => {
  if (!o || typeof o !== "object" || !("note" in o)) return o;
  const { note: _note, ...rest } = o;
  return rest;
};

export const guards: Guard[] = [
  {
    id: "strip-order-notes",
    category: "injection",
    description: "Remove free-text order notes from tool results so hidden instructions never reach the model.",
    appliesTo: ["lookup_order", "list_my_orders"],
    sanitize: (result) => (Array.isArray(result) ? result.map(stripNote) : stripNote(result)),
  },
];
