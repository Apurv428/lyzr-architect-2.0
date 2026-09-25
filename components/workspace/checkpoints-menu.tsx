"use client";

import { Check, History, Loader2, RotateCcw } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { timeAgo } from "@/lib/time";
import { useRestore } from "@/lib/workspace/use-restore";
import { useWorkspace } from "@/lib/workspace/store";
import { cn } from "@/lib/utils";

export function CheckpointsMenu() {
  const checkpoints = useWorkspace((s) => s.checkpoints);
  const current = useWorkspace((s) => s.checkpointId);
  const streaming = useWorkspace((s) => s.streaming);
  const { restore, restoring } = useRestore();
  const count = checkpoints.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger data-tour="checkpoints" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
        <History /> <span className="hidden sm:inline">{count} checkpoint{count === 1 ? "" : "s"}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Every change is saved — restore any version</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {count === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">No checkpoints yet</p>}
        <div className="max-h-80 overflow-y-auto">
          {[...checkpoints].reverse().map((c, i) => {
            const isCurrent = c.id === current;
            return (
              <DropdownMenuItem
                key={c.id}
                disabled={isCurrent || streaming}
                onClick={() => restore(c.id)}
                className="flex items-start gap-3 py-2"
              >
                <span className="relative mt-1 flex flex-col items-center">
                  <span className={cn("size-2.5 rounded-full border-2", isCurrent ? "border-primary bg-primary" : "border-muted-foreground")} />
                  {i < count - 1 && <span className="absolute top-3 h-6 w-px bg-border" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{c.label}</span>
                  <span className="block text-xs text-muted-foreground">{timeAgo(c.created_at)}</span>
                </span>
                {isCurrent ? (
                  <span className="inline-flex items-center gap-1 text-xs text-primary"><Check className="size-3.5" /> Current</span>
                ) : restoring === c.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><RotateCcw className="size-3.5" /> Restore</span>
                )}
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
