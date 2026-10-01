"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Bot, Check, Code2, FlaskConical, GitBranch, ListChecks, Loader2, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createAgent } from "@/lib/actions/agents";
import { graphFromPlan } from "@/lib/agent/seed";
import { DEFAULT_CONFIG, KIND_META, TOOL_CATALOG, type GraphEdge, type GraphNode, type NodeKind } from "@/lib/agent/types";
import { updateAgent, useAgentUi } from "@/lib/agent/use-agent";
import type { Plan } from "@/lib/ai/schema";
import { FRAMEWORKS } from "@/lib/catalog";
import { useWorkspace } from "@/lib/workspace/store";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { AgentNode } from "./agent-node";
import { CodeView } from "./code-view";
import { EvalsPanel } from "./evals-panel";
import { GitAgent } from "./git-agent";
import { Inspector } from "./inspector";
import { DRAG_TYPE, Palette } from "./palette";
import { TestConsole } from "./test-console";

const NODE_TYPES = { agent: AgentNode };

function newNode(kind: NodeKind, position: { x: number; y: number }): GraphNode {
  const label = kind === "tool" ? TOOL_CATALOG[0].label : KIND_META[kind].pro;
  return {
    id: `${kind}-${crypto.randomUUID().slice(0, 8)}`,
    type: "agent",
    position,
    data: { kind, label, config: structuredClone(DEFAULT_CONFIG[kind]) },
  };
}

function Canvas() {
  const agent = useWorkspace((s) => s.agent)!;
  const selectedId = useAgentUi((s) => s.selectedId);
  const theme = useTheme();
  const flow = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);

  const nodes = useMemo(() => agent.graph.nodes.map((n) => ({ ...n, selected: n.id === selectedId })), [agent.graph.nodes, selectedId]);
  const edges = useMemo(
    () => agent.graph.edges.map((e) => ({ ...e, animated: true, style: { stroke: "var(--primary)", strokeOpacity: 0.6 } })),
    [agent.graph.edges],
  );

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // Selection is tracked in UI state; only persist structural changes.
    const structural = changes.filter((c) => c.type !== "select" && c.type !== "dimensions");
    const current = useWorkspace.getState().agent!;
    const nextNodes = applyNodeChanges(changes, current.graph.nodes) as GraphNode[];
    const dragging = changes.some((c) => c.type === "position" && c.dragging);
    updateAgent({ graph: { ...current.graph, nodes: nextNodes } }, { save: structural.length > 0 && !dragging });
    const removed = changes.find((c) => c.type === "remove");
    if (removed && removed.id === useAgentUi.getState().selectedId) useAgentUi.getState().set({ selectedId: null, panel: null });
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const current = useWorkspace.getState().agent!;
    const structural = changes.some((c) => c.type === "remove" || c.type === "add");
    updateAgent({ graph: { ...current.graph, edges: applyEdgeChanges(changes, current.graph.edges) as GraphEdge[] } }, { save: structural });
  }, []);

  const onConnect = useCallback((c: Connection) => {
    const current = useWorkspace.getState().agent!;
    const edges = addEdge({ ...c, id: `e-${c.source}-${c.target}` }, current.graph.edges) as GraphEdge[];
    updateAgent({ graph: { ...current.graph, edges } });
  }, []);

  function add(kind: NodeKind, position?: { x: number; y: number }) {
    const current = useWorkspace.getState().agent!;
    const llm = current.graph.nodes.find((n) => n.data.kind === "llm");
    const lowest = Math.max(0, ...current.graph.nodes.map((n) => n.position.y));
    const beside = llm && (kind === "knowledge" || kind === "memory")
      ? { x: llm.position.x + 300 + current.graph.nodes.filter((n) => n.data.kind === kind).length * 30, y: llm.position.y - 130 }
      : undefined;
    const node = newNode(kind, position ?? beside ?? { x: 260, y: lowest + 140 });

    // Blocks that only matter when attached to the brain get wired up automatically.
    const edges = [...current.graph.edges];
    if (llm && (kind === "knowledge" || kind === "memory")) edges.push({ id: `e-${node.id}-${llm.id}`, source: node.id, target: llm.id });
    if (llm && (kind === "tool" || kind === "mcp")) edges.push({ id: `e-${llm.id}-${node.id}`, source: llm.id, target: node.id });

    updateAgent({ graph: { ...current.graph, nodes: [...current.graph.nodes, node], edges } });
    useAgentUi.getState().set({ selectedId: node.id, panel: "inspector" });
  }

  return (
    <div className="flex h-full min-h-0">
      <Palette onAdd={(k) => add(k)} />
      <div
        ref={wrapper}
        className="relative min-w-0 flex-1"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          e.preventDefault();
          const kind = e.dataTransfer.getData(DRAG_TYPE) as NodeKind;
          if (kind) add(kind, flow.screenToFlowPosition({ x: e.clientX - 100, y: e.clientY - 30 }));
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, n) => useAgentUi.getState().set({ selectedId: n.id, panel: "inspector" })}
          onPaneClick={() => useAgentUi.getState().panel === "inspector" && useAgentUi.getState().set({ selectedId: null, panel: null })}
          onNodeDragStop={() => updateAgent({})}
          colorMode={theme}
          fitView
          fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
          proOptions={{ hideAttribution: true }}
          deleteKeyCode={["Backspace", "Delete"]}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}

function SaveIndicator() {
  const state = useAgentUi((s) => s.saveState);
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      {state === "saving" ? <Loader2 className="size-3 animate-spin" /> : state === "saved" ? <Check className="size-3" /> : <span className="size-1.5 rounded-full bg-amber-400" />}
      {state === "saving" ? "Saving" : state === "saved" ? "Saved" : "Unsaved"}
    </span>
  );
}

export function AgentTab() {
  const agent = useWorkspace((s) => s.agent);
  const mode = useWorkspace((s) => s.mode);
  const messages = useWorkspace((s) => s.messages);
  const panel = useAgentUi((s) => s.panel);
  const view = useAgentUi((s) => s.view);
  const [creating, setCreating] = useState(false);
  const plan = [...messages].reverse().find((m) => m.kind === "plan")?.data as Plan | undefined;

  async function create() {
    const { projectId, name } = useWorkspace.getState();
    setCreating(true);
    const agentName = plan?.agent.name ?? `${name} Agent`;
    const res = await createAgent(projectId, agentName, graphFromPlan(plan, name));
    setCreating(false);
    if ("error" in res) toast.error(res.error);
    else useWorkspace.getState().set({ agent: res.agent });
  }

  // Seed the agent from the approved plan the first time the tab opens.
  const seeded = useRef(false);
  useEffect(() => {
    if (!agent && plan && !seeded.current) {
      seeded.current = true;
      void create();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, plan]);

  if (!agent) {
    return (
      <div className="bg-grid flex h-full items-center justify-center p-6">
        <div className="max-w-xs text-center">
          <span className="mx-auto mb-3 grid size-11 place-items-center rounded-xl border bg-card">
            {creating ? <Loader2 className="size-5 animate-spin text-primary" /> : <Bot className="size-5 text-primary" />}
          </span>
          <p className="font-medium">{creating ? "Setting up your agent…" : "No agent yet"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {creating ? "Turning the plan into blocks you can edit." : "Approve a plan in the chat, or start from a blank agent."}
          </p>
          {!creating && (
            <Button className="mt-4" onClick={create}>
              <Workflow /> Start blank agent
            </Button>
          )}
        </div>
      </div>
    );
  }

  const showCode = mode === "pro" && view === "code";
  const showGit = mode === "pro" && view === "git";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <Bot className="size-4 text-primary" />
        <input
          value={agent.name}
          onChange={(e) => updateAgent({ name: e.target.value })}
          aria-label="Agent name"
          className="w-48 rounded-md bg-transparent px-1.5 py-1 text-sm font-medium outline-none hover:bg-muted focus:bg-muted"
        />
        <SaveIndicator />
        <div className="ml-auto flex items-center gap-1.5">
          {mode === "pro" && (
            <>
              {view !== "git" && (
                <select
                  value={agent.framework}
                  onChange={(e) => updateAgent({ framework: e.target.value })}
                  aria-label="Framework"
                  className="h-7 rounded-md border bg-background px-2 text-xs outline-none focus:border-primary"
                >
                  {FRAMEWORKS.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              )}
              <div className="flex rounded-md bg-muted p-0.5">
                {(["canvas", "code", "git"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => useAgentUi.getState().set({ view: v })}
                    className={cn("inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs", view === v ? "bg-background text-foreground" : "text-muted-foreground")}
                  >
                    {v === "canvas" ? <Workflow className="size-3.5" /> : v === "code" ? <Code2 className="size-3.5" /> : <GitBranch className="size-3.5" />}
                    {v === "canvas" ? "Canvas" : v === "code" ? "Code" : "GitAgent"}
                  </button>
                ))}
              </div>
            </>
          )}
          <Button
            size="sm"
            variant={panel === "evals" ? "secondary" : "outline"}
            onClick={() => useAgentUi.getState().set({ panel: panel === "evals" ? null : "evals", selectedId: null })}
          >
            <ListChecks /> {mode === "guided" ? "Checks" : "Evals"}
          </Button>
          <Button
            size="sm"
            variant={panel === "test" ? "secondary" : "default"}
            onClick={() => useAgentUi.getState().set({ panel: panel === "test" ? null : "test", selectedId: null })}
          >
            <FlaskConical /> {mode === "guided" ? "Try it" : "Test"}
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          {showGit ? (
            <GitAgent />
          ) : showCode ? (
            <CodeView />
          ) : (
            <ReactFlowProvider>
              <Canvas />
            </ReactFlowProvider>
          )}
        </div>
        {!showGit && panel === "inspector" && !showCode && <Inspector />}
        {!showGit && panel === "test" && <TestConsole />}
        {!showGit && panel === "evals" && <EvalsPanel />}
      </div>
    </div>
  );
}
