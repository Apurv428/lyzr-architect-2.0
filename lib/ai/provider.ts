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

// Free tiers rate-limit by the minute (Gemini: 15 requests/min) and say how long to wait in the 429 body,
// which the SDK's short backoff ignores. One cooldown is shared by every call in the process, so a burst
// of parallel eval cases waits once together instead of each failing.
let coolUntil = 0;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Exported for tests. Waits out a per-minute 429 (up to a minute) once, then retries the request. */
export async function patientFetch(url: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const wait = coolUntil - Date.now();
    if (wait > 0) await sleep(wait);
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt > 0) return res;
    const body = await res.clone().text().catch(() => "");
    // A daily quota won't reset in time, and an empty account never will.
    if (/PerDay|insufficient_quota/i.test(body)) return res;
    const seconds = Number(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(body)?.[1]) || Number(res.headers.get("retry-after")) || 10;
    if (seconds > 60) return res;
    coolUntil = Math.max(coolUntil, Date.now() + seconds * 1000 + 250);
  }
}

/**
 * OpenAI SDK client. The platform key follows OPENAI_BASE_URL, so an OpenAI-compatible provider (such as
 * Gemini's free tier) can stand in for OpenAI; a user's own key always goes to OpenAI itself.
 */
export function openaiClient(apiKey?: string) {
  return apiKey ? new OpenAI({ apiKey, baseURL: "https://api.openai.com/v1" }) : new OpenAI(process.env.OPENAI_BASE_URL ? { fetch: patientFetch } : {});
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

/** An OpenAI-compatible endpoint for a model family picked on the agent canvas. */
export type CompatibleHost = { apiKey: string; baseURL: string; model: string; label: string };

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";

/**
 * Where a "gemini" or "llama" agent runs. Gemini uses GEMINI_API_KEY, or the platform key when
 * OPENAI_BASE_URL already points at Gemini. Llama uses any OpenAI-compatible host (Groq, Together,
 * OpenRouter, a local Ollama) named by LLAMA_BASE_URL. Null when the server isn't set up for it.
 */
export function compatibleHost(model: string): CompatibleHost | null {
  if (model === "gemini") {
    const model = process.env.GEMINI_MODEL ?? "gemini-flash-lite-latest";
    if (process.env.GEMINI_API_KEY) return { apiKey: process.env.GEMINI_API_KEY, baseURL: GEMINI_URL, model, label: "Gemini" };
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_BASE_URL?.includes("generativelanguage.googleapis.com")) {
      return { apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL, model: process.env.GEMINI_MODEL ?? OPENAI_MODEL, label: "Gemini" };
    }
    return null;
  }
  if (model === "llama" && process.env.LLAMA_BASE_URL) {
    // Local hosts such as Ollama don't need a key, but the SDK requires a non-empty one.
    return { apiKey: process.env.LLAMA_API_KEY || "none", baseURL: process.env.LLAMA_BASE_URL, model: process.env.LLAMA_MODEL ?? "llama-3.3-70b-versatile", label: "Llama" };
  }
  return null;
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
