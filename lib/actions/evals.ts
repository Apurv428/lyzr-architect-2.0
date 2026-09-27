"use server";

import type { EvalCase, EvalKind, EvalResult, EvalRunSummary } from "@/lib/agent/evals";
import { track } from "@/lib/analytics";
import { getUser } from "@/lib/supabase/server";

const CASE_COLUMNS = "id, input, expectation, kind, created_at";
const KINDS: EvalKind[] = ["contains", "not_contains", "judge"];
const MAX_CASES = 25;

export async function listEvals(agentId: string): Promise<{ cases: EvalCase[]; runs: EvalRunSummary[]; latest: EvalResult[] }> {
  const { supabase } = await getUser();
  const [{ data: cases }, { data: runs }, { data: latest }] = await Promise.all([
    supabase.from("eval_cases").select(CASE_COLUMNS).eq("agent_id", agentId).order("created_at"),
    supabase.from("eval_runs").select("id, passed, graded, pass_rate, created_at").eq("agent_id", agentId).order("created_at", { ascending: false }).limit(12),
    supabase.from("eval_runs").select("results").eq("agent_id", agentId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return {
    cases: (cases ?? []) as EvalCase[],
    runs: ((runs ?? []) as EvalRunSummary[]).reverse(),
    latest: ((latest?.results as EvalResult[] | undefined) ?? []),
  };
}

function clean(patch: { input?: string; expectation?: string; kind?: string }) {
  const out: { input?: string; expectation?: string; kind?: EvalKind } = {};
  if (patch.input !== undefined) out.input = patch.input.trim().slice(0, 4000);
  if (patch.expectation !== undefined) out.expectation = patch.expectation.trim().slice(0, 1000);
  if (patch.kind !== undefined && KINDS.includes(patch.kind as EvalKind)) out.kind = patch.kind as EvalKind;
  return out;
}

export async function addEvalCase(agentId: string, c: { input: string; expectation: string; kind: EvalKind }) {
  const { supabase } = await getUser();
  const values = clean(c);
  if (!values.input) return { error: "A test needs an input message." };
  const { count } = await supabase.from("eval_cases").select("id", { count: "exact", head: true }).eq("agent_id", agentId);
  if ((count ?? 0) >= MAX_CASES) return { error: `Up to ${MAX_CASES} tests per agent.` };
  const { data, error } = await supabase.from("eval_cases").insert({ agent_id: agentId, ...values }).select(CASE_COLUMNS).single();
  if (error || !data) return { error: "Couldn't save the test." };
  await track(supabase, "eval_case_saved", { kind: values.kind });
  return { case: data as EvalCase };
}

export async function updateEvalCase(id: string, patch: { input?: string; expectation?: string; kind?: EvalKind }) {
  const { supabase } = await getUser();
  const values = clean(patch);
  if (values.input === "") return { error: "A test needs an input message." };
  const { error } = await supabase.from("eval_cases").update(values).eq("id", id);
  return error ? { error: "Couldn't save the test." } : { ok: true as const };
}

export async function deleteEvalCase(id: string) {
  const { supabase } = await getUser();
  const { error } = await supabase.from("eval_cases").delete().eq("id", id);
  return error ? { error: "Couldn't delete the test." } : { ok: true as const };
}

// ── Suggested evals from real traffic ────────────────────────────────────────

export type SuggestedTest = {
  id: string;
  agent_id: string;
  run_id: string;
  input: string;
  output: string;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
};

export async function listSuggestions(agentId: string): Promise<SuggestedTest[]> {
  const { supabase } = await getUser();
  const { data } = await supabase
    .from("suggested_eval_tests")
    .select("id, agent_id, run_id, input, output, status, created_at")
    .eq("agent_id", agentId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as SuggestedTest[];
}

export async function acceptSuggestion(
  suggestionId: string,
  agentId: string,
  c: { kind: EvalKind; expectation: string },
) {
  const { supabase } = await getUser();
  const { data: s } = await supabase
    .from("suggested_eval_tests")
    .select("input")
    .eq("id", suggestionId)
    .single();
  if (!s) return { error: "Suggestion not found." };

  const res = await addEvalCase(agentId, { input: s.input, ...c });
  if ("error" in res) return res;

  await supabase.from("suggested_eval_tests").update({ status: "accepted" }).eq("id", suggestionId);
  return { case: res.case };
}

export async function dismissSuggestion(id: string) {
  const { supabase } = await getUser();
  const { error } = await supabase.from("suggested_eval_tests").update({ status: "rejected" }).eq("id", id);
  return error ? { error: "Couldn't dismiss the suggestion." } : { ok: true as const };
}
