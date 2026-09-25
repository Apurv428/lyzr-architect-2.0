import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";

export const HAS_ANTHROPIC = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
export const HAS_OPENAI = Boolean(process.env.OPENAI_API_KEY);

export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.5";

export type Provider = "anthropic" | "openai" | "demo";

/** Which provider runs the builder chat. AI_PROVIDER wins when its key is present. */
export function chatProvider(): Provider {
  const preferred = process.env.AI_PROVIDER;
  if (preferred === "openai" && HAS_OPENAI) return "openai";
  if (preferred === "anthropic" && HAS_ANTHROPIC) return "anthropic";
  return HAS_ANTHROPIC ? "anthropic" : HAS_OPENAI ? "openai" : "demo";
}

/** Reasoning-effort is only accepted by reasoning model families. */
export const supportsReasoningEffort = (model: string) => /^(gpt-5|gpt-6|o\d)/.test(model);

export function toOpenAITools(tools: Anthropic.Beta.BetaTool[]): OpenAI.Chat.Completions.ChatCompletionFunctionTool[] {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.input_schema as Record<string, unknown> },
  }));
}
