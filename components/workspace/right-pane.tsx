"use client";

import { Bot, Code2, Database, Eye, Rocket } from "lucide-react";
import type { ChatMessage, Plan } from "@/lib/ai/schema";
import { useWorkspace, type Tab } from "@/lib/workspace/store";
import { cn } from "@/lib/utils";
import { CodeTab } from "./code-tab";
import { PreviewTab } from "./preview-tab";
import { AgentTab } from "@/components/agent/agent-tab";
import { DeployTab } from "@/components/deploy/deploy-tab";

const TABS: { id: Tab; label: string; icon: typeof Eye; proOnly?: boolean }[] = [
  { id: "preview", label: "Preview", icon: Eye },
  { id: "code", label: "Code", icon: Code2 },
  { id: "agent", label: "Agent", icon: Bot },
  { id: "data", label: "Data", icon: Database },
  { id: "deploy", label: "Deploy", icon: Rocket },
];

function latestPlan(messages: ChatMessage[]) {
  return [...messages].reverse().find((m) => m.kind === "plan")?.data as Plan | undefined;
}

function Empty({ icon: Icon, title, body }: { icon: typeof Eye; title: string; body: string }) {
  return (
    <div className="bg-grid flex h-full items-center justify-center p-6">
      <div className="max-w-xs text-center">
        <span className="mx-auto mb-3 grid size-11 place-items-center rounded-xl border bg-card">
          <Icon className="size-5 text-primary" />
        </span>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function DataTab() {
  const messages = useWorkspace((s) => s.messages);
  const mode = useWorkspace((s) => s.mode);
  const plan = latestPlan(messages);
  if (!plan?.data.length) return <Empty icon={Database} title="No data yet" body="The records your app keeps track of appear here." />;
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
        {plan.data.map((d) => (
          <div key={d.entity} className="overflow-hidden rounded-xl border bg-card/80">
            <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2 text-sm font-medium">
              <Database className="size-4 text-primary" /> {d.entity}
            </div>
            <ul className="divide-y text-sm">
              {d.fields.map((f) => (
                <li key={f} className={cn("px-4 py-1.5", mode === "pro" && "font-mono text-xs")}>{f}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RightPane() {
  const tab = useWorkspace((s) => s.tab);
  const files = useWorkspace((s) => s.files);
  const count = Object.keys(files).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" data-tour="tabs" className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => useWorkspace.getState().set({ tab: id })}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition",
              tab === id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" /> {label}
            {id === "code" && count > 0 && <span className="rounded bg-primary/15 px-1 text-[10px] text-primary">{count}</span>}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {tab === "preview" && <PreviewTab />}
        {tab === "code" && <CodeTab />}
        {tab === "agent" && <AgentTab />}
        {tab === "data" && <DataTab />}
        {tab === "deploy" && <DeployTab />}
      </div>
    </div>
  );
}
