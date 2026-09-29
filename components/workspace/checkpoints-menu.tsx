"use client";

import { useState } from "react";
import { Check, GitBranch, History, Loader2, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { duplicateProject } from "@/lib/actions/projects";
import { timeAgo } from "@/lib/time";
import { useRestore } from "@/lib/workspace/use-restore";
import { useWorkspace } from "@/lib/workspace/store";
import { cn } from "@/lib/utils";

function BranchDialog({ checkpointId, checkpointLabel, onClose }: { checkpointId: string; checkpointLabel: string; onClose: () => void }) {
  const projectId = useWorkspace((s) => s.projectId);
  const name = useWorkspace((s) => s.name);
  const [branchName, setBranchName] = useState(`${name} (branch)`);
  const [creating, setCreating] = useState(false);

  async function create() {
    if (!branchName.trim()) return;
    setCreating(true);
    const res = await duplicateProject(projectId, branchName.trim(), checkpointId);
    setCreating(false);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success(
      <span>
        Branch created.{" "}
        <a href={`/p/${res.id}`} className="underline">Open it →</a>
      </span>,
      { duration: 6000 }
    );
    onClose();
  }

  return (
    <div className="space-y-3 border-t bg-popover p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">Branch from &ldquo;{checkpointLabel}&rdquo;</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
      </div>
      <p className="text-[11px] text-muted-foreground">Creates a new project at this checkpoint. Both projects are independent from here.</p>
      <div className="flex gap-2">
        <input
          autoFocus
          value={branchName}
          onChange={(e) => setBranchName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="Branch name"
          className="h-7 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus:border-primary"
        />
        <Button size="xs" onClick={create} disabled={creating || !branchName.trim()}>
          {creating ? <Loader2 className="animate-spin" /> : <GitBranch />} Create
        </Button>
      </div>
    </div>
  );
}

export function CheckpointsMenu() {
  const checkpoints = useWorkspace((s) => s.checkpoints);
  const current = useWorkspace((s) => s.checkpointId);
  const streaming = useWorkspace((s) => s.streaming);
  const { restore, restoring } = useRestore();
  const [branchingFrom, setBranchingFrom] = useState<{ id: string; label: string } | null>(null);
  const count = checkpoints.length;

  return (
    <DropdownMenu onOpenChange={(open) => !open && setBranchingFrom(null)}>
      <DropdownMenuTrigger data-tour="checkpoints" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
        <History /> <span className="hidden sm:inline">{count} checkpoint{count === 1 ? "" : "s"}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <DropdownMenuGroup className="p-1">
          <DropdownMenuLabel className="px-2">Every change is saved — restore any version</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="my-0" />
        {count === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">No checkpoints yet</p>}
        <div className="max-h-80 overflow-y-auto p-1">
          {[...checkpoints].reverse().map((c, i) => {
            const isCurrent = c.id === current;
            return (
              <DropdownMenuItem
                key={c.id}
                disabled={streaming}
                // One handler for the whole row; the buttons inside stop propagation so a click never restores twice.
                onClick={() => !isCurrent && restore(c.id)}
                className="flex items-start gap-3 py-2 pr-2"
              >
                <span className="relative mt-1 flex flex-col items-center">
                  <span className={cn("size-2.5 rounded-full border-2", isCurrent ? "border-primary bg-primary" : "border-muted-foreground")} />
                  {i < count - 1 && <span className="absolute top-3 h-6 w-px bg-border" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{c.label}</span>
                  <span className="block text-xs text-muted-foreground">{timeAgo(c.created_at)}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5">
                  {isCurrent ? (
                    <span className="inline-flex items-center gap-1 text-xs text-primary"><Check className="size-3.5" /> Current</span>
                  ) : restoring === c.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); restore(c.id); }}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw className="size-3.5" /> Restore
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setBranchingFrom({ id: c.id, label: c.label }); }}
                    title="Branch a new project from this checkpoint"
                    aria-label={`Branch a new project from ${c.label}`}
                    className="inline-flex items-center text-xs text-muted-foreground hover:text-primary"
                  >
                    <GitBranch className="size-3.5" />
                  </button>
                </span>
              </DropdownMenuItem>
            );
          })}
        </div>
        {branchingFrom && (
          <BranchDialog
            checkpointId={branchingFrom.id}
            checkpointLabel={branchingFrom.label}
            onClose={() => setBranchingFrom(null)}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
