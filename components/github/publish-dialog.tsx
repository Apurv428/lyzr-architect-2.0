"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FileCode2, GitPullRequest, Loader2, Lock, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { previewPublish, publishToGitHub } from "@/lib/actions/publish";
import type { ChangesData } from "@/lib/ai/schema";
import { useWorkspace } from "@/lib/workspace/store";
import { ConnectGitHub } from "./connect-github";

type Preview = Exclude<Awaited<ReturnType<typeof previewPublish>>, { error: string }>;

export function PublishDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const projectId = useWorkspace((s) => s.projectId);
  const name = useWorkspace((s) => s.name);
  const messages = useWorkspace((s) => s.messages);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [repoName, setRepoName] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ url: string; label: string; kind: "pr" | "repo" } | null>(null);

  useEffect(() => {
    if (!open) return;
    previewPublish(projectId).then((res) => {
      if ("error" in res) {
        toast.error(res.error);
        onOpenChange(false);
        return;
      }
      setPreview(res);
      const changes = messages.filter((m) => m.kind === "changes").map((m) => m.data as ChangesData);
      setTitle(res.repo ? `Architect: ${res.label}` : `Initial commit from Architect — ${name}`);
      setRepoName(name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
      setBody(
        [
          `## What this adds`,
          ...changes.slice(-5).flatMap((c) => c.summary.map((s) => `- ${s}`)),
          ``,
          `## Files`,
          `- \`architect/app/\` — generated UI`,
          `- \`architect/agent/\` — agent starter code`,
          ``,
          `_Generated and reviewed checkpoint-by-checkpoint in Architect 2.0._`,
        ].join("\n"),
      );
    });
  }, [open, projectId, name, messages, onOpenChange]);

  async function submit() {
    setPending(true);
    const res = await publishToGitHub(projectId, { title, body, repoName, isPrivate });
    setPending(false);
    if ("error" in res) toast.error(res.error);
    else {
      setResult(res);
      if (res.kind === "repo") useWorkspace.getState().set({ githubRepo: res.label });
    }
  }

  const isPr = Boolean(preview?.repo);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitPullRequest className="size-4 text-primary" /> {isPr ? "Open a pull request" : "Push to a new GitHub repo"}
          </DialogTitle>
          <DialogDescription>
            {preview?.repo ? `Changes go to a new branch on ${preview.repo} — nothing merges without your review.` : "Your code, your repo. Export any time."}
          </DialogDescription>
        </DialogHeader>

        {!preview ? (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Preparing files…</p>
        ) : result ? (
          <div className="space-y-4 py-4 text-center">
            <p className="text-lg font-semibold">{result.kind === "pr" ? "Pull request opened 🎉" : "Repository created 🎉"}</p>
            <a href={result.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              {result.label} <ExternalLink className="size-3.5" />
            </a>
          </div>
        ) : !preview.connected ? (
          <div className="mx-auto w-full max-w-xs py-4">
            <ConnectGitHub next={`/p/${projectId}`} onConnected={() => previewPublish(projectId).then((r) => !("error" in r) && setPreview(r))} />
          </div>
        ) : (
          <div className="space-y-4">
            {!isPr && (
              <div className="flex gap-2">
                <input value={repoName} onChange={(e) => setRepoName(e.target.value)} className="h-9 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus:border-primary" aria-label="Repository name" />
                <button onClick={() => setIsPrivate((p) => !p)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 text-xs">
                  <Lock className="size-3.5" /> {isPrivate ? "Private" : "Public"}
                </button>
              </div>
            )}
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 w-full rounded-lg border bg-background px-3 text-sm font-medium outline-none focus:border-primary" aria-label="Title" />
            {isPr && <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-32 font-mono text-xs" />}
            <div className="max-h-40 overflow-y-auto rounded-lg border">
              {preview.files.map((f) => (
                <div key={f.path} className="flex items-center gap-2 border-b px-3 py-1.5 font-mono text-xs last:border-b-0">
                  <FileCode2 className="size-3.5 text-muted-foreground" /> {f.path}
                  <span className="ml-auto inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400"><Plus className="size-3" />{f.lines}</span>
                </div>
              ))}
            </div>
            <Button size="lg" className="w-full" onClick={submit} disabled={pending || !title.trim()}>
              {pending ? <Loader2 className="animate-spin" /> : <GitPullRequest />}
              {isPr ? "Create pull request" : "Create repository & push"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
