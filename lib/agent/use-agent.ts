"use client";

import { create } from "zustand";
import { toast } from "sonner";
import { saveAgent } from "@/lib/actions/agents";
import { useWorkspace } from "@/lib/workspace/store";
import type { AgentGraph, AgentRecord, GraphNode } from "./types";

type AgentUi = {
  selectedId: string | null;
  panel: "inspector" | "test" | "evals" | null;
  /** Bumped when a test case is saved elsewhere (e.g. from the test console) so the Evals panel reloads. */
  evalsVersion: number;
  view: "canvas" | "code" | "git";
  saveState: "saved" | "saving" | "unsaved";
  set: (s: Partial<Omit<AgentUi, "set">>) => void;
};

export const useAgentUi = create<AgentUi>((set) => ({
  selectedId: null,
  panel: null,
  evalsVersion: 0,
  view: "canvas",
  saveState: "saved",
  set: (s) => set(s),
}));

// Persist only the graph's own fields — React Flow adds runtime ones (selected, measured…).
function clean(graph: AgentGraph): AgentGraph {
  return {
    nodes: graph.nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
    edges: graph.edges.map(({ id, source, target }) => ({ id, source, target })),
  };
}

let timer: ReturnType<typeof setTimeout> | undefined;

function scheduleSave(agent: AgentRecord) {
  useAgentUi.getState().set({ saveState: "unsaved" });
  clearTimeout(timer);
  timer = setTimeout(async () => {
    useAgentUi.getState().set({ saveState: "saving" });
    const res = await saveAgent(agent.id, { name: agent.name, framework: agent.framework, graph: clean(agent.graph) });
    if (res.error) toast.error(`Couldn't save agent: ${res.error}`);
    useAgentUi.getState().set({ saveState: res.error ? "unsaved" : "saved" });
  }, 700);
}

export function updateAgent(patch: Partial<AgentRecord> | ((a: AgentRecord) => Partial<AgentRecord>), opts: { save?: boolean } = {}) {
  const current = useWorkspace.getState().agent;
  if (!current) return;
  const next = { ...current, ...(typeof patch === "function" ? patch(current) : patch) };
  useWorkspace.getState().set({ agent: next });
  if (opts.save !== false) scheduleSave(next);
}

export function updateNode(id: string, patch: (n: GraphNode) => GraphNode) {
  updateAgent((a) => ({ graph: { ...a.graph, nodes: a.graph.nodes.map((n) => (n.id === id ? patch(n) : n)) } }));
}
