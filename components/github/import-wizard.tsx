"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Bot, Check, FileCode2, FlaskConical, FolderGit2, GitBranch, Globe, Loader2, Lock, ScanSearch, Search, Sparkles, Star,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { analyzeRepo, importRepo, listRepos, type RepoListItem } from "@/lib/actions/github";
import { FRAMEWORKS } from "@/lib/catalog";
import type { RepoSummary } from "@/lib/github";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { ConnectGitHub } from "./connect-github";

const ANALYSIS_STEPS = ["Fetching repository", "Reading the file tree", "Detecting your stack", "Looking for existing AI code"];

function Analyzing() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, ANALYSIS_STEPS.length - 1)), 650);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="mx-auto max-w-sm space-y-3 py-10">
      {ANALYSIS_STEPS.map((s, j) => (
        <div key={s} className={cn("flex items-center gap-3 text-sm transition", j > i && "opacity-40")}>
          {j < i ? <Check className="size-4 text-emerald-600 dark:text-emerald-400" /> : j === i ? <Loader2 className="size-4 animate-spin text-primary" /> : <span className="size-4 rounded-full border" />}
          {s}
        </div>
      ))}
    </div>
  );
}

export function ImportWizard({ connected: initiallyConnected, login: initialLogin }: { connected: boolean; login?: string }) {
  const [connected, setConnected] = useState(initiallyConnected);
  const [login, setLogin] = useState(initialLogin);
  const [repos, setRepos] = useState<RepoListItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [summary, setSummary] = useState<RepoSummary | null>(null);
  const [goal, setGoal] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, startImport] = useTransition();

  useEffect(() => {
    if (!connected) return;
    listRepos().then((res) => ("error" in res ? toast.error(res.error) : setRepos(res.repos)));
  }, [connected]);

  const filtered = useMemo(
    () => (repos ?? []).filter((r) => r.fullName.toLowerCase().includes(query.toLowerCase())).slice(0, 30),
    [repos, query],
  );

  async function analyze(input: string) {
    setAnalyzing(true);
    setSummary(null);
    const [res] = await Promise.all([analyzeRepo(input, branch || undefined), new Promise((r) => setTimeout(r, 1800))]);
    setAnalyzing(false);
    if ("error" in res) toast.error(res.error);
    else setSummary(res.summary);
  }

  function create() {
    if (!summary) return;
    startImport(async () => {
      const res = await importRepo(summary, goal);
      if (res?.error) toast.error(res.error);
    });
  }

  const step = summary ? 2 : analyzing ? 1 : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex gap-2">
        {["Choose a repo", "Analyze", "Describe the change"].map((label, i) => (
          <div key={label} className="flex-1 space-y-1.5">
            <div className={cn("h-1 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />
            <p className={cn("text-xs", i === step ? "text-foreground" : "text-muted-foreground")}>{label}</p>
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {analyzing ? (
          <motion.div key="analyzing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-2xl border bg-card/60">
            <Analyzing />
          </motion.div>
        ) : summary ? (
          <motion.div key="summary" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div className="glow overflow-hidden rounded-2xl border bg-card">
              <div className="flex items-start gap-3 border-b p-5">
                <span className="grid size-10 place-items-center rounded-xl bg-primary/15"><FolderGit2 className="size-5 text-primary" /></span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold">
                    {summary.fullName} {summary.isPrivate && <Lock className="size-3.5 text-muted-foreground" />}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{summary.description ?? "No description"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><GitBranch className="size-3.5" /> {summary.branch}</span>
                  <span className="inline-flex items-center gap-1"><Star className="size-3.5" /> {summary.stars}</span>
                </div>
              </div>
              <div className="grid gap-5 p-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Stack</p>
                  <div className="flex flex-wrap gap-1.5">
                    {summary.stack.length ? summary.stack.map((s) => <span key={s} className="rounded-md bg-muted px-2 py-1 text-xs">{s}</span>) : <span className="text-sm text-muted-foreground">Not detected</span>}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">AI already in use</p>
                  <div className="flex flex-wrap gap-1.5">
                    {summary.agentLibs.length ? (
                      summary.agentLibs.map((s) => <span key={s} className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-1 text-xs text-primary"><Bot className="size-3" />{s}</span>)
                    ) : (
                      <span className="text-sm text-muted-foreground">None yet — a clean slate</span>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Languages</p>
                  <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                    {summary.languages.map((l, i) => (
                      <div key={l.name} style={{ width: `${l.share}%` }} className={["bg-primary", "bg-sky-400", "bg-emerald-400", "bg-amber-400", "bg-rose-400"][i]} />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{summary.languages.map((l) => `${l.name} ${l.share}%`).join(" · ")}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Shape</p>
                  <p className="flex items-center gap-3 text-sm">
                    <span className="inline-flex items-center gap-1"><FileCode2 className="size-4 text-muted-foreground" /> {summary.fileCount} files</span>
                    <span className="inline-flex items-center gap-1"><FlaskConical className="size-4 text-muted-foreground" /> {summary.hasTests ? "Has tests" : "No tests found"}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Suggested framework: <span className="text-foreground">{FRAMEWORKS.find((f) => f.id === summary.suggestedFramework)?.name}</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="font-medium">What should Architect add?</p>
              <Textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Add a support agent that answers questions from our /docs folder and escalates billing issues"
                className="min-h-24 bg-card/60"
              />
              <div className="flex flex-wrap gap-2">
                {summary.suggestions.map((s) => (
                  <button key={s} onClick={() => setGoal(s)} className="rounded-full border bg-card/40 px-3 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground">
                    {s}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Architect loads the repo’s source files (up to 40) so you keep working on the real code. Your repo isn’t touched until you open a pull request.</p>
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setSummary(null)}><ArrowLeft /> Pick another repo</Button>
              <Button size="lg" onClick={create} disabled={!goal.trim() || importing}>
                {importing ? <Loader2 className="animate-spin" /> : <Sparkles />} Plan the change
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="pick" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid gap-4 lg:grid-cols-[1fr_300px]">
            <div className="rounded-2xl border bg-card/60 p-4">
              {connected ? (
                <>
                  <div className="mb-3 flex items-center gap-2">
                    <p className="text-sm font-medium">Your repositories</p>
                    {login && <span className="text-xs text-muted-foreground">@{login}</span>}
                  </div>
                  <label className="mb-3 flex items-center gap-2 rounded-lg border bg-background px-3">
                    <Search className="size-4 text-muted-foreground" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search repositories" className="h-9 flex-1 bg-transparent text-sm outline-none" />
                  </label>
                  <div className="max-h-[420px] space-y-1 overflow-y-auto">
                    {!repos && <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading repositories…</p>}
                    {repos && !filtered.length && <p className="p-4 text-sm text-muted-foreground">No repositories match.</p>}
                    {filtered.map((r) => (
                      <button
                        key={r.fullName}
                        onClick={() => analyze(r.fullName)}
                        className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted"
                      >
                        {r.isPrivate ? <Lock className="size-4 shrink-0 text-muted-foreground" /> : <Globe className="size-4 shrink-0 text-muted-foreground" />}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{r.fullName}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[r.language, `updated ${timeAgo(r.updatedAt)}`].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="text-xs text-primary opacity-0 transition group-hover:opacity-100">Import <ArrowRight className="inline size-3" /></span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="mx-auto max-w-xs space-y-4 py-8 text-center">
                  <FolderGit2 className="mx-auto size-8 text-primary" />
                  <div>
                    <p className="font-medium">Connect GitHub</p>
                    <p className="text-sm text-muted-foreground">See your private repos and open pull requests from Architect.</p>
                  </div>
                  <ConnectGitHub next="/import" onConnected={(l) => { setConnected(true); setLogin(l); }} />
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-2xl border bg-card/60 p-4">
              <p className="flex items-center gap-2 text-sm font-medium"><ScanSearch className="size-4 text-primary" /> Any public repo</p>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && url.trim() && analyze(url)}
                placeholder="github.com/owner/repo"
                className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:border-primary"
              />
              <input
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="Branch (default branch if empty)"
                className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:border-primary"
              />
              <Button className="w-full" onClick={() => analyze(url)} disabled={!url.trim()}>
                Analyze repo <ArrowRight />
              </Button>
              <p className="text-xs text-muted-foreground">No login needed for public repos. Try <button className="underline" onClick={() => setUrl("vercel/ai-chatbot")}>vercel/ai-chatbot</button>.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
