"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowUp, ListChecks, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ModeToggle } from "@/components/app/mode-toggle";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AttachButton, PendingChips, useAttachments } from "@/components/workspace/attachments";
import { createProject } from "@/lib/actions/projects";
import { FRAMEWORKS } from "@/lib/catalog";
import type { Mode } from "@/lib/types";
import { cn } from "@/lib/utils";

const SUGGESTIONS: Record<Mode, string[]> = {
  guided: [
    "A customer FAQ bot trained on my website",
    "Summarise my team's weekly Slack updates",
    "A hiring assistant that screens resumes",
  ],
  pro: [
    "RAG API over a Postgres + pgvector store",
    "Multi-agent research crew with web search",
    "Add a tool-calling agent to my Next.js repo",
  ],
};

export function PromptBox({ defaultMode, initialPrompt = "" }: { defaultMode: Mode; initialPrompt?: string }) {
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [framework, setFramework] = useState<string>(FRAMEWORKS[0].id);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);
  const files = useAttachments();

  function submit() {
    const text = prompt.trim() || (files.ready.length ? "Build an app like the attached reference." : "");
    if (!text || pending || files.uploading) return;
    startTransition(async () => {
      const res = await createProject({ prompt: text, mode, framework: mode === "pro" ? framework : undefined, attachments: files.ready });
      if (res?.error) toast.error(res.error);
    });
  }

  return (
    <div id="new" className="space-y-3">
      <div className="glow rounded-2xl border bg-card/80 p-3 backdrop-blur transition focus-within:border-primary/60" {...files.dropTarget}>
        <PendingChips items={files.items} onRemove={files.remove} />
        <textarea
          ref={ref}
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 260)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          rows={3}
          placeholder={
            mode === "guided"
              ? "Describe what you want in plain words — or paste a screenshot of something you like"
              : "Describe the app or agent. Mention stack, data sources, tools, constraints…"
          }
          className="w-full resize-none bg-transparent px-2 py-1.5 text-base outline-none placeholder:text-muted-foreground/70"
        />
        <div className="flex flex-wrap items-center gap-2">
          <ModeToggle value={mode} onChange={setMode} layoutId="prompt-mode" />

          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2 py-1 text-xs text-primary" />
              }
            >
              <ListChecks className="size-3.5" /> Plan first
            </TooltipTrigger>
            <TooltipContent>Architect shows a plan for your approval before writing code.</TooltipContent>
          </Tooltip>

          {mode === "pro" && (
            <select
              value={framework}
              onChange={(e) => setFramework(e.target.value)}
              aria-label="Agent framework"
              className="h-7 rounded-lg border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {FRAMEWORKS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <AttachButton onFiles={files.add} disabled={pending} />
            <Button size="icon" aria-label="Start building" onClick={submit} disabled={(!prompt.trim() && !files.ready.length) || pending || files.uploading}>
              {pending ? <Loader2 className="animate-spin" /> : <ArrowUp />}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS[mode].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setPrompt(s);
              ref.current?.focus();
            }}
            className={cn(
              "rounded-full border bg-card/40 px-3 py-1 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-foreground",
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
