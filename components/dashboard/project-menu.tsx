"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteProject, duplicateProject, updateProject } from "@/lib/actions/projects";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ProjectMenu({ project, className }: { project: Project; className?: string }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const [name, setName] = useState(project.name);
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();
  const live = project.status === "deployed" || Boolean(project.deploy_url);
  // Deleting can't be undone, so the name must be typed exactly, as on GitHub.
  const confirmed = confirm.trim() === project.name;

  const run = (fn: () => Promise<void>) => start(fn);

  function rename() {
    run(async () => {
      const res = await updateProject(project.id, { name });
      if (res.error) return void toast.error(res.error);
      setDialog(null);
      toast.success("Renamed");
      router.refresh();
    });
  }

  function duplicate() {
    run(async () => {
      const res = await duplicateProject(project.id);
      if ("error" in res) return void toast.error(res.error);
      toast.success("Duplicated", { action: { label: "Open", onClick: () => router.push(`/p/${res.id}`) } });
      router.refresh();
    });
  }

  function remove() {
    run(async () => {
      const res = await deleteProject(project.id);
      if (res.error) return void toast.error(res.error);
      setDialog(null);
      toast.success(`Deleted “${project.name}”`);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Actions for ${project.name}`}
          className={cn(
            buttonVariants({ variant: "secondary", size: "icon-sm" }),
            "bg-background/80 backdrop-blur",
            className,
          )}
        >
          {pending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => { setName(project.name); setDialog("rename"); }}>
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={duplicate}>
            <Copy /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => { setConfirm(""); setDialog("delete"); }}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === "rename"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
          </DialogHeader>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && rename()}
            className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:border-primary"
          />
          <Button onClick={rename} disabled={!name.trim() || pending}>Save</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "delete"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete “{project.name}”?</DialogTitle>
            <DialogDescription>
              This removes the chat, every checkpoint and the agent.
              {live && " Its live link will stop working immediately."} This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-1.5 text-sm">
            <span className="text-muted-foreground">
              To confirm, type <span className="font-medium break-all text-foreground">{project.name}</span> in the box below
            </span>
            <input
              autoFocus
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmed && !pending && remove()}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-label={`Type ${project.name} to confirm`}
              className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:border-destructive"
            />
          </label>
          <Button variant="destructive" onClick={remove} disabled={pending || !confirmed}>
            {pending ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete project
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
