"use client";

import { useState } from "react";
import { GitBranch, Info, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_GIT_AGENT, type GitAgentSettings } from "@/lib/agent/types";
import { updateAgent } from "@/lib/agent/use-agent";
import { commitMessage, prBranch, prConventions } from "@/lib/git-agent";
import { useWorkspace } from "@/lib/workspace/store";
import { cn } from "@/lib/utils";

const SKILL_SUGGESTIONS = [
  "Write tests for every change",
  "Always update the README when adding a feature",
  "Prefer small, focused commits over large ones",
  "Run linting before committing",
  "Add JSDoc comments to exported functions",
];

const STYLES: { id: GitAgentSettings["commitStyle"]; label: string }[] = [
  { id: "conventional", label: "Conventional" },
  { id: "imperative", label: "Imperative" },
  { id: "descriptive", label: "Descriptive" },
];

const field = "w-full rounded-lg border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

function TagList({ items, onChange, placeholder, suggestions }: { items: string[]; onChange: (next: string[]) => void; placeholder: string; suggestions?: string[] }) {
  const [draft, setDraft] = useState("");
  const remaining = suggestions?.filter((s) => !items.includes(s)) ?? [];
  const add = (v: string) => {
    const value = v.trim();
    if (value && !items.includes(value)) onChange([...items, value]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <li key={item} className="flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs">
              {item}
              <button aria-label={`Remove ${item}`} onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground">
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1.5">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add(draft)} placeholder={placeholder} className={cn(field, "text-xs")} />
        <Button size="icon-sm" variant="outline" aria-label="Add" onClick={() => add(draft)}>
          <Plus />
        </Button>
      </div>
      {remaining.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {remaining.slice(0, 4).map((s) => (
            <button key={s} onClick={() => add(s)} className="rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-foreground">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** How this agent's changes land in GitHub. Saved with the agent and applied when a pull request is opened. */
export function GitAgent() {
  const agent = useWorkspace((s) => s.agent)!;
  const projectName = useWorkspace((s) => s.name);
  const githubRepo = useWorkspace((s) => s.githubRepo);
  const git = { ...DEFAULT_GIT_AGENT, ...agent.graph.git };

  const set = <K extends keyof GitAgentSettings>(key: K, value: GitAgentSettings[K]) =>
    updateAgent((a) => ({ graph: { ...a.graph, git: { ...DEFAULT_GIT_AGENT, ...a.graph.git, [key]: value } } }));

  const sampleTitle = "Add a support agent";
  const footer = prConventions(git);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <GitBranch className="size-4 text-primary" />
        <span className="text-sm font-semibold">GitAgent</span>
        <span className="ml-auto truncate text-xs text-muted-foreground">{githubRepo ? `Repository: ${githubRepo}` : "Pull requests open from the GitHub button in the top bar"}</span>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <div className="flex gap-2 rounded-xl border border-blue-500/30 bg-blue-500/5 px-3 py-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-blue-500" />
          <span>
            These conventions apply whenever this project opens a pull request or pushes a new repo: the branch name, the commit message and a
            section in the pull request description. Changes save automatically.
          </span>
        </div>

        <Field label="Identity" hint="Who the changes come from. Shown at the end of every pull request.">
          <Textarea
            value={git.identity}
            onChange={(e) => set("identity", e.target.value)}
            placeholder="e.g. Architect AI, the frontend team's automation agent"
            className="min-h-16 text-xs"
          />
        </Field>

        <Field label="Branch prefix" hint="New pull request branches start with this.">
          <input
            value={git.branchPrefix}
            onChange={(e) => set("branchPrefix", e.target.value.replace(/[^\w./-]/g, ""))}
            placeholder="architect/"
            className={cn(field, "font-mono text-xs")}
          />
        </Field>

        <Field label="Commit style">
          <div className="flex gap-2">
            {STYLES.map((s) => (
              <button
                key={s.id}
                onClick={() => set("commitStyle", s.id)}
                className={cn(
                  "flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition",
                  git.commitStyle === s.id ? "border-primary bg-primary/10 text-primary" : "bg-muted/30 text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Rules" hint="Listed in every pull request so reviewers know what the agent was asked to follow.">
          <TagList items={git.rules} onChange={(next) => set("rules", next)} placeholder="e.g. Never commit to main directly" />
        </Field>

        <Field label="Skills" hint="Habits the agent applies to every change.">
          <TagList items={git.skills} onChange={(next) => set("skills", next)} placeholder="e.g. Write tests for every change" suggestions={SKILL_SUGGESTIONS} />
        </Field>

        <div className="space-y-1.5 rounded-xl border bg-muted/30 p-3">
          <p className="text-xs font-medium">Next pull request will look like</p>
          <dl className="space-y-1 font-mono text-[11px] text-muted-foreground">
            <div className="flex gap-2"><dt className="w-14 shrink-0">branch</dt><dd className="truncate text-foreground">{prBranch(git, projectName, 0).replace(/-0$/, "-…")}</dd></div>
            <div className="flex gap-2"><dt className="w-14 shrink-0">commit</dt><dd className="whitespace-pre-wrap text-foreground">{commitMessage(git, sampleTitle, ["Updated /App.tsx"])}</dd></div>
          </dl>
          {footer && <pre className="whitespace-pre-wrap border-t pt-2 font-mono text-[11px] text-muted-foreground">{footer}</pre>}
        </div>
      </div>
    </div>
  );
}
