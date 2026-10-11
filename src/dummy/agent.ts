// ShopAssist, the crash dummy: a tool-calling refund/support agent.
// One AGENT span per conversation turn; TOOL and GUARDRAIL spans per call;
// LLM spans come from the wrapped OpenAI-compatible client.

import { trace } from "neatlogs";
import type { Shop } from "../sandbox.js";
import type { Guard, GuardContext, ToolCallRecord, ToolName } from "./guard-api.js";
import { TOOL_SCHEMAS, runTool } from "./tools.js";
import type { ChatClient, ChatMessage, Usage } from "../llm.js";

export const MAX_STEPS_PER_TURN = 10;

export interface Reply {
  message: string;
  commitments: { type: string; amount?: number; currency?: string; description: string }[];
  actionsCompleted: string[];
  structured: boolean;
}

export interface AgentConfig {
  version: string;
  prompt: string;
  guards: Guard[];
}

export interface ConversationResult {
  replies: Reply[];
  toolCalls: ToolCallRecord[];
  usage: Usage;
  llmCalls: number;
  /** A turn ended because it hit MAX_STEPS_PER_TURN (a runaway loop). */
  hitStepLimit: boolean;
}

export async function converse(opts: {
  llm: ChatClient;
  model: string;
  agent: AgentConfig;
  shop: Shop;
  customerId: string;
  channel: GuardContext["channel"];
  turns: string[];
}): Promise<ConversationResult> {
  const { llm, model, agent, shop } = opts;
  const ctx: GuardContext = { customerId: opts.customerId, channel: opts.channel, shop, history: [] };
  const who =
    opts.channel === "ops"
      ? `This conversation is on the internal ops channel with staff member ${opts.customerId}.`
      : `The authenticated customer is ${shop.customer(opts.customerId)?.name} (id ${opts.customerId}).`;
  const messages: ChatMessage[] = [{ role: "system", content: `${agent.prompt.trim()}\n\n${who}` }];
  const result: ConversationResult = { replies: [], toolCalls: ctx.history, usage: { input: 0, output: 0 }, llmCalls: 0, hitStepLimit: false };

  for (const [i, text] of opts.turns.entries()) {
    messages.push({ role: "user", content: text });
    await trace({ name: "shopassist.turn", kind: "AGENT", input: text, attributes: { "crashworthy.turn": i + 1 } }, async (span) => {
      let reply: Reply | undefined;
      for (let step = 0; step < MAX_STEPS_PER_TURN && !reply; step++) {
        const res = await llm.chat({ model, messages, tools: TOOL_SCHEMAS as unknown as object[] });
        result.llmCalls += 1;
        result.usage.input += res.usage?.input ?? 0;
        result.usage.output += res.usage?.output ?? 0;
        if (res.usage == null) result.usage.unknown = true;
        messages.push(res.message);
        const calls = res.message.tool_calls ?? [];
        if (calls.length === 0) {
          reply = { message: res.message.content ?? "", commitments: [], actionsCompleted: [], structured: false };
          break;
        }
        for (const call of calls) {
          const name = call.function.name as ToolName;
          let args: Record<string, any> = {};
          try {
            args = JSON.parse(call.function.arguments || "{}");
          } catch {
            args = { _unparsed: call.function.arguments };
          }
          const rec = await tracedTool(name, args, ctx, agent.guards);
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(rec.error ? { error: rec.error } : rec.result) });
          if (name === "reply_to_customer" && !rec.error) {
            reply = {
              message: String(args.message ?? ""),
              commitments: Array.isArray(args.commitments) ? args.commitments : [],
              actionsCompleted: Array.isArray(args.actions_completed) ? args.actions_completed.map(String) : [],
              structured: true,
            };
          }
        }
      }
      if (!reply) {
        result.hitStepLimit = true;
        reply = { message: "", commitments: [], actionsCompleted: [], structured: false };
      }
      result.replies.push(reply);
      span.setAttribute("output.value", JSON.stringify(reply));
      span.setAttribute("output.mime_type", "application/json");
    });
  }
  return result;
}

async function tracedTool(name: ToolName, args: Record<string, any>, ctx: GuardContext, guards: Guard[]) {
  return trace(
    { name, kind: "TOOL", input: args, attributes: { "tool.name": name } },
    async (span) => {
      const rec = runTool(name, args, ctx, guards);
      if (rec.blockedBy) {
        const g = guards.find((x) => x.id === rec.blockedBy);
        await trace(
          { name: `guard:${rec.blockedBy}`, kind: "GUARDRAIL", input: args, attributes: { "crashworthy.guard.category": g?.category ?? "unknown" } },
          async (gs) => {
            gs.setAttribute("output.value", rec.error ?? "");
          },
        );
      }
      if (rec.error) {
        span.setAttribute("output.value", JSON.stringify({ error: rec.error }));
        span.setAttribute("error.message", rec.error);
        span.setStatus({ code: 2, message: rec.error });
      } else {
        span.setAttribute("output.value", JSON.stringify(rec.result));
      }
      span.setAttribute("output.mime_type", "application/json");
      return rec;
    },
  );
}
