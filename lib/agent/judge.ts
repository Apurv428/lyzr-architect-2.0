import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ResolvedProvider } from "@/lib/ai/keys";
import { openaiClient, openaiModelFor, supportsReasoningEffort } from "@/lib/ai/provider";
import { parseVerdict } from "./evals";

const JUDGE_SYSTEM = `You grade replies from an AI agent against a test criterion written by the agent's owner.
Judge only the criterion, not style. Answer with exactly one line:
PASS: <one short reason>
or
FAIL: <one short reason>`;

/** Asks the same provider that ran the agent, at low effort, whether a reply meets the criterion. */
export async function judge(llm: ResolvedProvider, criterion: string, input: string, output: string) {
  if (llm.provider === "demo") return { pass: null, reason: "AI-judged checks need a model key — skipped in demo mode." };
  const prompt = `<criterion>${criterion}</criterion>\n<user_message>${input}</user_message>\n<agent_reply>${output}</agent_reply>`;

  if (llm.provider === "anthropic") {
    const client = new Anthropic(llm.apiKey ? { apiKey: llm.apiKey } : {});
    const res = await client.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: 2000,
      system: JUDGE_SYSTEM,
      messages: [{ role: "user", content: prompt }],
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return parseVerdict(text);
  }

  const client = openaiClient(llm.apiKey);
  const model = openaiModelFor(Boolean(llm.apiKey));
  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: JUDGE_SYSTEM },
      { role: "user", content: prompt },
    ],
    max_completion_tokens: 2000,
    ...(supportsReasoningEffort(model) ? { reasoning_effort: "low" as const } : {}),
  });
  return parseVerdict(res.choices[0]?.message.content ?? "");
}
