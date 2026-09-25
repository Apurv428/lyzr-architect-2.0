"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { BeforeMount } from "@monaco-editor/react";
import { Code2, Eye, FileCode2, GitCompareArrows, Loader2, Lock, Save, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveManualEdit } from "@/lib/actions/checkpoints";
import { useWorkspace } from "@/lib/workspace/store";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const Editor = dynamic(() => import("@monaco-editor/react").then((m) => m.Editor), { ssr: false, loading: () => <EditorLoading /> });
const DiffEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.DiffEditor), { ssr: false, loading: () => <EditorLoading /> });

function EditorLoading() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 size-4 animate-spin" /> Loading editor…
    </div>
  );
}

// The sandbox compiles the code; Monaco is only for reading and editing.
const quietTypeScript: BeforeMount = (monaco) => {
  const ts = (monaco.languages as unknown as {
    typescript?: { typescriptDefaults: { setDiagnosticsOptions: (o: object) => void } };
  }).typescript;
  ts?.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: true });
};

const EDITOR_OPTIONS = {
  fontSize: 12.5,
  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  padding: { top: 12 },
  automaticLayout: true,
  renderLineHighlight: "none" as const,
};

type Change = "added" | "modified" | null;

export function CodeTab() {
  const files = useWorkspace((s) => s.files);
  const prevFiles = useWorkspace((s) => s.prevFiles);
  const mode = useWorkspace((s) => s.mode);
  const streaming = useWorkspace((s) => s.streaming);
  const theme = useTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const paths = useMemo(
    () => Object.keys(files).sort((a, b) => (a === "/App.tsx" ? -1 : b === "/App.tsx" ? 1 : a.localeCompare(b))),
    [files],
  );
  const changes = useMemo(() => {
    const map: Record<string, Change> = {};
    const hasPrev = Object.keys(prevFiles).length > 0;
    for (const p of paths) map[p] = !hasPrev ? null : prevFiles[p] === undefined ? "added" : prevFiles[p] !== files[p] ? "modified" : null;
    return map;
  }, [paths, files, prevFiles]);

  const current = selected && files[selected] !== undefined ? selected : paths[0];
  const dirty = Object.keys(edits).filter((p) => edits[p] !== files[p]);
  const editable = mode === "pro" && !streaming;
  const changedCount = Object.values(changes).filter(Boolean).length;

  async function save() {
    if (!dirty.length) return;
    setSaving(true);
    const next = { ...files, ...edits };
    const { projectId } = useWorkspace.getState();
    const res = await saveManualEdit(projectId, next, dirty);
    setSaving(false);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    const s = useWorkspace.getState();
    s.applyFiles(next, res.checkpoint);
    s.upsertMessage(res.message);
    setEdits({});
    toast.success("Saved as a new checkpoint");
  }

  if (!paths.length) {
    return (
      <div className="bg-grid flex h-full items-center justify-center p-6 text-center">
        <div>
          <Code2 className="mx-auto mb-2 size-6 text-primary" />
          <p className="font-medium">No code yet</p>
          <p className="text-sm text-muted-foreground">Files show up here once Architect builds your app.</p>
        </div>
      </div>
    );
  }

  const language = current.endsWith(".css") ? "css" : "typescript";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3 text-xs">
        {mode === "guided" ? (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Eye className="size-3.5" /> Peek mode — this is the code behind your app. Switch to Pro to edit it.
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            {editable ? <Code2 className="size-3.5" /> : <Lock className="size-3.5" />}
            {editable ? "Edits are saved as a checkpoint" : "Read-only while Architect is working"}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {changedCount > 0 && (
            <Button size="xs" variant={showDiff ? "secondary" : "ghost"} onClick={() => setShowDiff((v) => !v)}>
              <GitCompareArrows /> {showDiff ? "Hide changes" : `Changes (${changedCount})`}
            </Button>
          )}
          {dirty.length > 0 && (
            <>
              <Button size="xs" variant="ghost" onClick={() => setEdits({})}>
                <Undo2 /> Discard
              </Button>
              <Button size="xs" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />} Save {dirty.length} file{dirty.length > 1 ? "s" : ""}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[190px_1fr]">
        <nav className="overflow-y-auto border-r p-2">
          {paths.map((p) => (
            <button
              key={p}
              onClick={() => setSelected(p)}
              className={cn(
                "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left font-mono text-xs text-muted-foreground hover:bg-muted",
                p === current && "bg-muted text-foreground",
              )}
            >
              <FileCode2 className="size-3.5 shrink-0" />
              <span className="truncate">{p.slice(1)}</span>
              {dirty.includes(p) ? (
                <span className="ml-auto size-1.5 shrink-0 rounded-full bg-amber-400" title="Unsaved" />
              ) : changes[p] ? (
                <span
                  className={cn("ml-auto text-[10px] font-semibold", changes[p] === "added" ? "text-emerald-600 dark:text-emerald-400" : "text-sky-600 dark:text-sky-400")}
                  title={changes[p] === "added" ? "Added in the last change" : "Modified in the last change"}
                >
                  {changes[p] === "added" ? "A" : "M"}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="min-w-0">
          {showDiff ? (
            <DiffEditor
              key={`diff-${current}`}
              theme={theme === "dark" ? "vs-dark" : "light"}
              language={language}
              original={prevFiles[current] ?? ""}
              modified={files[current]}
              beforeMount={quietTypeScript}
              options={{ ...EDITOR_OPTIONS, readOnly: true, renderSideBySide: false }}
            />
          ) : (
            <Editor
              key={current}
              theme={theme === "dark" ? "vs-dark" : "light"}
              path={current}
              language={language}
              value={edits[current] ?? files[current]}
              beforeMount={quietTypeScript}
              onChange={(value) => editable && setEdits((e) => ({ ...e, [current]: value ?? "" }))}
              options={{ ...EDITOR_OPTIONS, readOnly: !editable }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
