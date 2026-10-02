import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ResolvedProvider } from "@/lib/ai/keys";
import { openaiClient, openaiModelFor, supportsReasoningEffort } from "@/lib/ai/provider";

/** One-shot text completion on the resolved provider (the judge and Autopilot use this). */
export async function completeText(llm: ResolvedProvider, system: string, prompt: string, maxTokens = 4000): Promise<string> {
  if (llm.provider === "anthropic") {
    const client = new Anthropic(llm.apiKey ? { apiKey: llm.apiKey } : {});
    const res = await client.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  }
  const client = openaiClient(llm.apiKey);
  const model = openaiModelFor(Boolean(llm.apiKey));
  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
    max_completion_tokens: maxTokens,
    ...(supportsReasoningEffort(model) ? { reasoning_effort: "low" as const } : {}),
  });
  return res.choices[0]?.message.content ?? "";
}
