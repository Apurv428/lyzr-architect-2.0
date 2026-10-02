export type BuilderTool = "write_files" | "propose_plan" | "ask_questions";

/**
 * Some OpenAI-compatible models (Gemini) end a turn with text where a tool call belonged: they copy
 * the way earlier calls are recorded in the history ("[I updated /App.tsx — …]"), or announce the
 * change ("I'm updating the button…") and stop. Returns the tool the reply should have called.
 */
export function missedToolCall(text: string): BuilderTool | null {
  const t = text.trim();
  if (!t) return null;
  if (/\[I updated\b/.test(t)) return "write_files";
  if (/\[I proposed this plan\]/.test(t)) return "propose_plan";
  if (/\[I asked\]/.test(t)) return "ask_questions";
  // An action announced in the present tense and never carried out. Past-tense answers ("I made it
  // green by…") are ordinary replies and are left alone.
  if (/^((ok(ay)?|sure|got it)[,.!]?\s+)?I('m|’m| am) (now )?(updating|changing|adding|fixing|making|building|writing|creating|removing|replacing|applying)\b/i.test(t)) {
    return "write_files";
  }
  return null;
}
