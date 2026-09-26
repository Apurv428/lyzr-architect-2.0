// Eval grading. `contains` / `not_contains` are checked here; `judge` asks a model (see judge.ts)
// and this module only parses its verdict.

export type EvalKind = "contains" | "not_contains" | "judge";

export type EvalCase = { id: string; input: string; expectation: string; kind: EvalKind; created_at: string };

export type EvalResult = {
  case_id: string;
  input: string;
  kind: EvalKind;
  expectation: string;
  /** null = not graded (judge without a model, or the run failed). */
  pass: boolean | null;
  output: string;
  reason: string;
};

export type EvalRunSummary = { id: string; passed: number; graded: number; pass_rate: number | null; created_at: string };

export type EvalEvent =
  | { t: "start"; caseId: string }
  | { t: "result"; result: EvalResult; ms: number }
  | { t: "done"; runId: string | null; passed: number; graded: number; charged: number }
  | { t: "error"; message: string };

export const KIND_LABEL: Record<EvalKind, { pro: string; guided: string }> = {
  contains: { pro: "Contains", guided: "Mentions" },
  not_contains: { pro: "Doesn't contain", guided: "Never says" },
  judge: { pro: "AI judge", guided: "Checked by AI" },
};

const normalize = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();

/** Expectations can list alternatives separated by `|`, e.g. "5 business days | five business days". */
function terms(expectation: string) {
  return expectation.split("|").map(normalize).filter(Boolean);
}

export function gradeText(kind: Exclude<EvalKind, "judge">, expectation: string, output: string): { pass: boolean; reason: string } {
  const text = normalize(output);
  const wanted = terms(expectation);
  if (!wanted.length) return { pass: false, reason: "Add the text to look for." };
  const hit = wanted.find((w) => text.includes(w));
  if (kind === "contains") {
    return hit ? { pass: true, reason: `Found “${hit}”.` } : { pass: false, reason: `Didn't find ${wanted.map((w) => `“${w}”`).join(" or ")}.` };
  }
  return hit ? { pass: false, reason: `Reply contains “${hit}”.` } : { pass: true, reason: `Never mentions ${wanted.map((w) => `“${w}”`).join(" or ")}.` };
}

/** Parses a judge reply of the form `PASS: reason` / `FAIL: reason`. Anything else is ungraded. */
export function parseVerdict(reply: string): { pass: boolean | null; reason: string } {
  const line = reply.trim().split("\n").find((l) => /\b(PASS|FAIL)\b/i.test(l)) ?? "";
  const match = line.match(/\b(PASS|FAIL)\b\s*[:\-—–]?\s*(.*)$/i);
  if (!match) return { pass: null, reason: "The judge didn't give a clear verdict." };
  return { pass: match[1].toUpperCase() === "PASS", reason: match[2].trim().replace(/^["“]|["”]$/g, "") || (match[1].toUpperCase() === "PASS" ? "Meets the criteria." : "Doesn't meet the criteria.") };
}

export function summarize(results: Pick<EvalResult, "pass">[]) {
  const graded = results.filter((r) => r.pass !== null).length;
  const passed = results.filter((r) => r.pass === true).length;
  return { passed, graded, passRate: graded ? passed / graded : null };
}
