"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  ArrowRight,
  Bot,
  FolderGit2,
  FolderKanban,
  House,
  LayoutTemplate,
  Rocket,
  Search,
  Settings,
  Boxes,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Command = {
  id: string;
  label: string;
  hint?: string;
  icon: React.ElementType;
  keywords?: string;
  action: () => void;
};

function useCommands(router: ReturnType<typeof useRouter>, pathname: string) {
  return useMemo<Command[]>(() => {
    const nav: Command[] = [
      { id: "home", label: "Go to Home", hint: "Dashboard", icon: House, keywords: "dashboard home", action: () => router.push("/dashboard") },
      { id: "projects", label: "Go to Projects", icon: FolderKanban, keywords: "projects list all", action: () => router.push("/projects") },
      { id: "templates", label: "Browse Templates", icon: LayoutTemplate, keywords: "templates start", action: () => router.push("/templates") },
      { id: "agents", label: "Go to Agents", icon: Bot, keywords: "agents library", action: () => router.push("/agents") },
      { id: "deployments", label: "Go to Deployments", icon: Rocket, keywords: "deployments published", action: () => router.push("/deployments") },
      { id: "integrations", label: "Go to Integrations", icon: Boxes, keywords: "integrations slack gmail", action: () => router.push("/integrations") },
      { id: "import", label: "Import a project", icon: FolderGit2, keywords: "github import repo zip upload", action: () => router.push("/import") },
      { id: "settings", label: "Open Settings", icon: Settings, keywords: "settings profile theme", action: () => router.push("/settings") },
      { id: "new-project", label: "New project", icon: Plus, keywords: "new create project start", action: () => router.push("/dashboard") },
    ];

    // Workspace-specific commands — available when viewing a project
    const workspaceMatch = pathname.match(/^\/p\/([^/]+)/);
    if (workspaceMatch) {
      const id = workspaceMatch[1];
      nav.push(
        { id: "project-settings", label: "Project settings", icon: Settings, keywords: "rename mode webhook delete", action: () => router.push(`/p/${id}/settings`) },
        { id: "deploy", label: "Deploy this project", icon: Rocket, keywords: "deploy ship publish", action: () => router.push(`/p/${id}`) },
      );
    }

    return nav;
  }, [router, pathname]);
}

export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const commands = useCommands(router, pathname);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return commands;
    return commands.filter((c) =>
      c.label.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q) || c.keywords?.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
        setCursor(0);
      }
      if (!open) return;
      if (e.key === "Escape") { setOpen(false); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, filtered.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); return; }
      if (e.key === "Enter" && filtered[cursor]) {
        e.preventDefault();
        run(filtered[cursor]);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [open, filtered, cursor]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  function run(cmd: Command) {
    setOpen(false);
    setQuery("");
    cmd.action();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-3 py-2.5">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            placeholder="Search commands…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">ESC</kbd>
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No commands match &ldquo;{query}&rdquo;</p>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => run(cmd)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition",
                  i === cursor ? "bg-muted" : "hover:bg-muted/50",
                )}
              >
                <cmd.icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 font-medium">{cmd.label}</span>
                {cmd.hint && <span className="text-xs text-muted-foreground">{cmd.hint}</span>}
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
              </button>
            ))
          )}
        </div>
        <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          <span>↑↓ navigate</span>
          <span className="mx-2">·</span>
          <span>↵ open</span>
          <span className="mx-2">·</span>
          <span>⌘K to toggle</span>
        </div>
      </div>
    </div>
  );
}
