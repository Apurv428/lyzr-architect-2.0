export type TraceStep = {
  id: string;
  type: "trigger" | "knowledge" | "llm" | "tool" | "guardrail" | "output";
  title: string;
  detail?: string;
  result?: string;
  ms?: number;
  tokens?: number;
  /** Tool ran against a simulated integration. */
  simulated?: boolean;
  /** Tool ran for real (e.g. web search). */
  live?: boolean;
};

export type TraceEvent =
  | { t: "step"; step: TraceStep }
  | { t: "reply"; text: string }
  | { t: "done"; tokens: number; latencyMs: number; simulated: boolean; /** A platform credit was spent (false when the user's own key ran it). */ charged: boolean }
  | { t: "error"; message: string };
