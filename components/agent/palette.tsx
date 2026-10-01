"use client";

import { KIND_META, type NodeKind } from "@/lib/agent/types";
import { useWorkspace } from "@/lib/workspace/store";
import { cn } from "@/lib/utils";
import { KIND_ICON } from "./agent-node";

const ORDER: NodeKind[] = ["trigger", "llm", "tool", "knowledge", "memory", "guardrail", "output", "manager", "subagent", "mcp"];
export const DRAG_TYPE = "application/x-architect-node";

export function Palette({ onAdd }: { onAdd: (kind: NodeKind) => void }) {
  const mode = useWorkspace((s) => s.mode);
  return (
    <aside className="flex w-44 shrink-0 flex-col gap-1 overflow-y-auto border-r p-2">
      <p className="px-1.5 pt-1 pb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {mode === "guided" ? "Add a block" : "Nodes"}
      </p>
      {ORDER.map((kind) => {
        const meta = KIND_META[kind];
        const Icon = KIND_ICON[kind];
        return (
          <button
            key={kind}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_TYPE, kind);
              e.dataTransfer.effectAllowed = "move";
            }}
            onClick={() => onAdd(kind)}
            title={meta.hint}
            className="group flex cursor-grab items-center gap-2 rounded-lg border border-transparent px-1.5 py-1.5 text-left text-sm hover:border-border hover:bg-muted/60 active:cursor-grabbing"
          >
            <span className={cn("grid size-7 shrink-0 place-items-center rounded-md", meta.color)}>
              <Icon className="size-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px]">{meta[mode]}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{meta.hint}</span>
            </span>
          </button>
        );
      })}
      <p className="mt-auto px-1.5 pt-3 text-[11px] leading-relaxed text-muted-foreground">
        Drag onto the canvas or click to add. Connect blocks by dragging from a dot.
      </p>
    </aside>
  );
}
