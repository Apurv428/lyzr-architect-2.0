import type Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

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

/**
 * OpenAI SDK client. The platform key follows OPENAI_BASE_URL, so an OpenAI-compatible provider (such as
 * Gemini's free tier) can stand in for OpenAI; a user's own key always goes to OpenAI itself.
 */
export function openaiClient(apiKey?: string) {
  return apiKey ? new OpenAI({ apiKey, baseURL: "https://api.openai.com/v1" }) : new OpenAI();
}

/**
 * The model for an OpenAI-SDK call. A GPT model picked on the canvas runs as-is when the call goes to OpenAI.
 * When the platform key points at another provider, OPENAI_MODEL names that provider's model, so a user's
 * own OpenAI key falls back to OpenAI's default instead.
 */
export function openaiModelFor(ownKey: boolean, requested?: string) {
  const onOpenAI = ownKey || !process.env.OPENAI_BASE_URL;
  if (requested?.startsWith("gpt") && onOpenAI) return requested;
  return ownKey && process.env.OPENAI_BASE_URL ? "gpt-5.5" : OPENAI_MODEL;
}

/** The account behind the key has no credits left. OpenAI sends this as a 429, but retrying never helps. */
export function isOutOfCredits(err: unknown) {
  return err instanceof OpenAI.APIError && (err.type === "insufficient_quota" || err.code === "insufficient_quota");
}

/** Reasoning-effort is only accepted by reasoning model families. */
export const supportsReasoningEffort = (model: string) => /^(gpt-5|gpt-6|o\d)/.test(model);

export function toOpenAITools(tools: Anthropic.Beta.BetaTool[]): OpenAI.Chat.Completions.ChatCompletionFunctionTool[] {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.input_schema as Record<string, unknown> },
  }));
}
