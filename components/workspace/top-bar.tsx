"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, GitBranch, Rocket, Settings, Share2, Zap } from "lucide-react";
import { toast } from "sonner";
import { LogoMark } from "@/components/brand/logo";
import { ModeToggle } from "@/components/app/mode-toggle";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Button } from "@/components/ui/button";
import { updateProject } from "@/lib/actions/projects";
import { useWorkspace } from "@/lib/workspace/store";
import { CheckpointsMenu } from "./checkpoints-menu";
import { ShareDialog } from "./share-dialog";
import { DeployDialog } from "@/components/deploy/deploy-dialog";
import { PublishDialog } from "@/components/github/publish-dialog";
import type { Mode } from "@/lib/types";

export function TopBar() {
  const { projectId, name, mode, credits, checkpoints } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const githubRepo = useWorkspace((s) => s.githubRepo);

  async function rename(value: string) {
    setEditing(false);
    const next = value.trim();
    if (!next || next === name) return;
    useWorkspace.getState().set({ name: next });
    const res = await updateProject(projectId, { name: next });
    if (res.error) toast.error(res.error);
  }

  async function changeMode(next: Mode) {
    useWorkspace.getState().set({ mode: next });
    const res = await updateProject(projectId, { mode: next });
    if (res.error) toast.error(res.error);
    else toast(next === "pro" ? "Pro mode — code, diffs and framework controls are on" : "Guided mode — plain language, no code in the way");
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-1.5 border-b px-2 sm:gap-2 sm:px-3">
      <Link href="/dashboard" aria-label="Back to dashboard" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        <LogoMark className="size-6" />
      </Link>

      {editing ? (
        <input
          autoFocus
          defaultValue={name}
          onBlur={(e) => rename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-7 w-56 rounded-md border bg-background px-2 text-sm font-medium outline-none focus:border-primary"
        />
      ) : (
        <button onClick={() => setEditing(true)} className="max-w-56 truncate rounded-md px-2 py-1 text-sm font-medium hover:bg-muted" title="Rename">
          {name}
        </button>
      )}

      <span data-tour="mode" className="ml-1 inline-flex rounded-full">
        <ModeToggle value={mode} onChange={changeMode} layoutId="workspace-mode" compact />
      </span>

      <div className="ml-auto flex items-center gap-1">
        <span className="mr-2 hidden items-center gap-1 text-xs text-muted-foreground lg:inline-flex">
          <Zap className="size-3.5 text-primary" /> {credits} credits
        </span>
        <span className="hidden sm:contents">
          <ThemeToggle />
        </span>
        <Link href={`/p/${projectId}/settings`} aria-label="Project settings">
          <Button variant="ghost" size="icon-sm">
            <Settings />
          </Button>
        </Link>
        <CheckpointsMenu />
        <Button variant="ghost" size="sm" onClick={() => setPublishOpen(true)} disabled={checkpoints.length === 0}>
          <GitBranch /> <span className="hidden sm:inline">{githubRepo ? "Open PR" : "GitHub"}</span>
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Share" className="hidden sm:inline-flex" onClick={() => useWorkspace.getState().set({ dialog: "invite" })}>
          <Share2 />
        </Button>
        <Button size="sm" data-tour="deploy" aria-label="Deploy" onClick={() => useWorkspace.getState().set({ dialog: "deploy" })} disabled={checkpoints.length === 0}>
          <Rocket /> <span className="hidden sm:inline">Deploy</span>
        </Button>
        <PublishDialog key={String(publishOpen)} open={publishOpen} onOpenChange={setPublishOpen} />
        <DeployDialog />
        <ShareDialog />
      </div>
    </header>
  );
}
