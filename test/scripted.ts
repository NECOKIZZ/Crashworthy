// A scripted stand-in for the model: per turn, it emits the given tool calls
// one per response, then nothing more. Used only to test the harness itself.

import type { ChatClient, ChatMessage } from "../src/llm.js";

export type Step = { tool: string; args: Record<string, unknown> } | { text: string };

export function scripted(turns: Step[][]): ChatClient {
  let turn = -1;
  let step = 0;
  let seenUsers = 0;
  return {
    async chat({ messages }) {
      const users = messages.filter((m) => m.role === "user").length;
      if (users !== seenUsers) {
        seenUsers = users;
        turn += 1;
        step = 0;
      }
      const s = turns[turn]?.[step++] ?? { text: "(script ended)" };
      const message: ChatMessage =
        "text" in s
          ? { role: "assistant", content: s.text }
          : { role: "assistant", content: null, tool_calls: [{ id: `c${turn}_${step}`, type: "function", function: { name: s.tool, arguments: JSON.stringify(s.args) } }] };
      return { message, usage: { input: 100, output: 20 } };
    },
  };
}

export const reply = (message: string, extra: { commitments?: unknown[]; actions_completed?: string[] } = {}): Step => ({
  tool: "reply_to_customer",
  args: { message, commitments: extra.commitments ?? [], actions_completed: extra.actions_completed ?? [] },
});

export const refund = (order_id: string, amount: number, card = "4242", currency = "INR", key?: string): Step => ({
  tool: "issue_refund",
  args: { order_id, amount, currency, destination_card_last4: card, reason: "test", ...(key ? { idempotency_key: key } : {}) },
});
