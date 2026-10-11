// Model access. Real runs go through the hackathon LiteLLM proxy
// (OpenAI-compatible) with the client wrapped by neatlogs so every model call
// becomes an LLM span. Unit tests use scripted clients instead.

import OpenAI from "openai";
import { wrapOpenAI } from "neatlogs/openai";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

/** Provider-reported token usage. `unknown` marks calls whose usage was not reported (not zero). */
export interface Usage {
  input: number;
  output: number;
  unknown?: boolean;
}

export interface ChatResult {
  message: ChatMessage;
  usage: Usage | null;
}

export interface ChatClient {
  chat(req: { model: string; messages: ChatMessage[]; tools?: object[]; json?: boolean }): Promise<ChatResult>;
}

export function liteLLM(): ChatClient {
  const apiKey = process.env.LITELLM_API_KEY;
  const baseURL = process.env.LITELLM_BASE_URL;
  if (!apiKey || !baseURL) throw new Error("Set LITELLM_API_KEY and LITELLM_BASE_URL (the hackathon LiteLLM proxy) to run real models.");
  const client = wrapOpenAI(new OpenAI({ apiKey, baseURL, maxRetries: 3, timeout: 120_000 }));
  return {
    async chat({ model, messages, tools, json }) {
      const res = await client.chat.completions.create({
        model,
        messages: messages as OpenAI.ChatCompletionMessageParam[],
        temperature: 0,
        ...(tools ? { tools: tools as OpenAI.ChatCompletionTool[], tool_choice: "auto" as const } : {}),
        ...(json ? { response_format: { type: "json_object" as const } } : {}),
      });
      const m = res.choices[0]?.message;
      return {
        message: {
          role: "assistant",
          content: m?.content ?? null,
          ...(m?.tool_calls?.length
            ? {
                tool_calls: m.tool_calls
                  .filter((c) => c.type === "function")
                  .map((c) => ({ id: c.id, type: "function" as const, function: { name: c.function.name, arguments: c.function.arguments } })),
              }
            : {}),
        },
        usage: res.usage ? { input: res.usage.prompt_tokens, output: res.usage.completion_tokens } : null,
      };
    },
  };
}

export async function listModels(): Promise<string[]> {
  const res = await fetch(`${process.env.LITELLM_BASE_URL?.replace(/\/$/, "")}/models`, {
    headers: { Authorization: `Bearer ${process.env.LITELLM_API_KEY}` },
  });
  if (!res.ok) throw new Error(`GET /models -> ${res.status}`);
  const body = (await res.json()) as { data: { id: string }[] };
  return body.data.map((m) => m.id);
}

/** USD per million tokens [input, output]. Override with CW_PRICES='{"model":[in,out]}'. */
export function pricePerMTok(model: string): [number, number] | null {
  const table: Record<string, [number, number]> = {
    ...DEFAULT_PRICES,
    ...(process.env.CW_PRICES ? JSON.parse(process.env.CW_PRICES) : {}),
  };
  const key = Object.keys(table).find((k) => model.toLowerCase().includes(k));
  return key ? table[key] : null;
}

const DEFAULT_PRICES: Record<string, [number, number]> = {
  haiku: [1, 5],
  sonnet: [3, 15],
  opus: [5, 25],
  "nova-micro": [0.035, 0.14],
  "nova-lite": [0.06, 0.24],
  "nova-pro": [0.8, 3.2],
  "gpt-4o-mini": [0.15, 0.6],
};

export function costUSD(model: string, u: Usage): number | null {
  const p = pricePerMTok(model);
  return p ? (u.input * p[0] + u.output * p[1]) / 1e6 : null;
}
