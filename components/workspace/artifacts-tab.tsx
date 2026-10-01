"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Copy, Download, FileSpreadsheet, FileText, Presentation } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Plan } from "@/lib/ai/schema";
import { dataModelCsv, deckMarkdown, reportMarkdown, specMarkdown, type ArtifactInput } from "@/lib/artifacts";
import { useWorkspace } from "@/lib/workspace/store";

type ArtifactType = "report" | "presentation" | "spreadsheet" | "document";

const ARTIFACTS: { id: ArtifactType; label: string; description: string; icon: typeof FileText; ext: "md" | "csv"; build: (i: ArtifactInput) => string }[] = [
  { id: "report", label: "Project report", description: "Screens, data model, agent tools and rules, and the files built so far.", icon: FileText, ext: "md", build: reportMarkdown },
  { id: "presentation", label: "Deck outline", description: "Slide-by-slide story: the problem, what was built, how the agent works.", icon: Presentation, ext: "md", build: deckMarkdown },
  { id: "document", label: "Product spec", description: "Requirements drawn from the plan: flows, data, agent behaviour, assumptions.", icon: FileText, ext: "md", build: specMarkdown },
  { id: "spreadsheet", label: "Data model (CSV)", description: "Every planned record and field, ready for Excel or Google Sheets.", icon: FileSpreadsheet, ext: "csv", build: dataModelCsv },
];

/** Shareable documents generated from this project's plan, agent and files. */
export function ArtifactsTab() {
  const name = useWorkspace((s) => s.name);
  const messages = useWorkspace((s) => s.messages);
  const agent = useWorkspace((s) => s.agent);
  const files = useWorkspace((s) => s.files);
  const [viewing, setViewing] = useState<ArtifactType | null>(null);

  const input: ArtifactInput = useMemo(() => {
    const plan = [...messages].reverse().find((m) => m.kind === "plan")?.data as Plan | undefined;
    return { name, plan, agent: agent ? { name: agent.name, graph: agent.graph } : null, files };
  }, [name, messages, agent, files]);

  const spec = ARTIFACTS.find((a) => a.id === viewing);
  const content = spec ? spec.build(input) : "";
  const fileName = (a: (typeof ARTIFACTS)[number]) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project"}-${a.id}.${a.ext}`;

  function download(a: (typeof ARTIFACTS)[number]) {
    const blob = new Blob([a.build(input)], { type: a.ext === "csv" ? "text/csv" : "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName(a);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (spec) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
          <Button size="xs" variant="ghost" onClick={() => setViewing(null)}>
            <ArrowLeft /> Artifacts
          </Button>
          <span className="text-sm font-medium">{spec.label}</span>
          <div className="ml-auto flex gap-1.5">
            <Button size="xs" variant="ghost" onClick={() => navigator.clipboard.writeText(content).then(() => toast.success("Copied"))}>
              <Copy /> Copy
            </Button>
            <Button size="xs" variant="outline" onClick={() => download(spec)}>
              <Download /> Download .{spec.ext}
            </Button>
          </div>
        </div>
        <pre className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">{content}</pre>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-lg space-y-4">
        <div>
          <h3 className="font-semibold">Artifacts</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Documents built from this project&apos;s current plan, agent and files. They update as the project changes.
          </p>
        </div>
        {!input.plan && <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">There&apos;s no plan yet, so most sections will be empty. Describe the app in the chat first.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {ARTIFACTS.map((a) => (
            <div key={a.id} className="flex flex-col gap-2.5 rounded-xl border bg-card/60 p-3.5">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10">
                  <a.icon className="size-4 text-primary" />
                </span>
                <div>
                  <p className="text-sm font-medium">{a.label}</p>
                  <p className="text-xs text-muted-foreground">{a.description}</p>
                </div>
              </div>
              <div className="mt-auto flex gap-1.5">
                <Button size="sm" className="flex-1" onClick={() => setViewing(a.id)}>
                  Open
                </Button>
                <Button size="sm" variant="ghost" aria-label={`Download ${a.label}`} onClick={() => download(a)}>
                  <Download />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
