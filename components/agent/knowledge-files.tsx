"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { ingestKnowledgeFile, listKnowledgeDocs, removeKnowledgeDoc, type KnowledgeDoc } from "@/lib/actions/knowledge";
import { updateNode } from "@/lib/agent/use-agent";
import { uploadKnowledgeFile } from "@/lib/workspace/upload";
import { cn } from "@/lib/utils";

type Row = { key: string; name: string; doc?: KnowledgeDoc; step?: "Uploading" | "Reading" };

export function KnowledgeFiles({ agentId, nodeId }: { agentId: string; nodeId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    listKnowledgeDocs(agentId).then((docs) => {
      if (alive) setRows(docs.filter((d) => d.node_id === nodeId).map((d) => ({ key: d.id, name: d.name, doc: d })));
    });
    return () => {
      alive = false;
    };
  }, [agentId, nodeId]);

  // Keep the node's file list (used for the canvas summary) in sync.
  const syncNames = (next: Row[]) =>
    updateNode(nodeId, (n) => ({ ...n, data: { ...n.data, config: { ...n.data.config, files: next.filter((r) => r.doc).map((r) => r.name) } } }));

  async function add(files: File[]) {
    for (const file of files) {
      const key = crypto.randomUUID();
      setRows((rs) => [...(rs ?? []), { key, name: file.name, step: "Uploading" }]);
      try {
        const uploaded = await uploadKnowledgeFile(file, agentId);
        setRows((rs) => rs!.map((r) => (r.key === key ? { ...r, step: "Reading" } : r)));
        const res = await ingestKnowledgeFile(agentId, nodeId, uploaded);
        if ("error" in res) throw new Error(res.error);
        if (res.truncated) toast(`${file.name} is very long — only the first 400,000 characters are searchable.`);
        setRows((rs) => {
          const next = rs!.map((r) => (r.key === key ? { key: res.doc.id, name: res.doc.name, doc: res.doc } : r));
          syncNames(next);
          return next;
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
        setRows((rs) => rs!.filter((r) => r.key !== key));
      }
    }
  }

  async function remove(row: Row) {
    if (!row.doc) return;
    const res = await removeKnowledgeDoc(row.doc.id);
    if ("error" in res) return void toast.error(res.error);
    setRows((rs) => {
      const next = rs!.filter((r) => r.key !== row.key);
      syncNames(next);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void add([...e.dataTransfer.files]);
        }}
        className={cn(
          "flex w-full flex-col items-center gap-1 rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground transition hover:border-primary/60",
          over && "border-primary bg-primary/10",
        )}
      >
        <UploadCloud className="size-5 text-primary" />
        <span><span className="font-medium text-foreground">Drop files</span> or click to upload</span>
        <span>PDF, .txt or .md · up to 10 MB each</span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept="application/pdf,text/plain,text/markdown,.md,.txt"
        onChange={(e) => {
          void add([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />

      {rows === null ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Loading files…</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs">
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.name}</span>
                <span className="block text-muted-foreground">
                  {r.doc ? `${r.doc.pages} page${r.doc.pages === 1 ? "" : "s"} · ${r.doc.chars.toLocaleString()} chars` : `${r.step}…`}
                </span>
              </span>
              {r.doc ? (
                <button aria-label={`Remove ${r.name}`} onClick={() => remove(r)} className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              ) : (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
