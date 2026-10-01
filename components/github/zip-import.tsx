"use client";

import { useRef, useState } from "react";
import { FileArchive, Loader2, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { importZipProject } from "@/lib/actions/imports";
import { IMPORT_LIMITS, pickImportFiles, prepareImport, stripCommonRoot } from "@/lib/workspace/import";
import { readZip } from "@/lib/zip";
import { cn } from "@/lib/utils";

const MAX_ZIP_BYTES = 25 * 1024 * 1024;

type Picked = { name: string; files: Record<string, string>; skipped: number; previewable: boolean };

/** Upload a ZIP of a local project: unzipped in the browser, filtered to readable source, then imported. */
export function ZipImport() {
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [goal, setGoal] = useState("");
  const [importing, setImporting] = useState(false);

  async function read(file: File) {
    if (!/\.zip$/i.test(file.name)) return toast.error("Choose a .zip file.");
    if (file.size > MAX_ZIP_BYTES) return toast.error("That ZIP is over 25 MB. Remove node_modules and build folders, then try again.");
    setReading(true);
    try {
      const entries = readZip(new Uint8Array(await file.arrayBuffer()));
      const relative = stripCommonRoot(entries.map((e) => e.path));
      const byPath = new Map(entries.map((e, i) => [relative[i], e]));
      const { picked: paths, skipped } = pickImportFiles(relative.map((path, i) => ({ path, size: entries[i].size })));
      if (!paths.length) throw new Error("No readable source files found in that ZIP.");
      const files: Record<string, string> = {};
      for (const path of paths) files[path] = await byPath.get(path)!.read();
      setPicked({ name: file.name, files, skipped, previewable: prepareImport(files).previewable });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read that ZIP.");
    } finally {
      setReading(false);
    }
  }

  async function submit() {
    if (!picked) return;
    setImporting(true);
    const res = await importZipProject({ name: picked.name, goal, files: picked.files, skipped: picked.skipped });
    // Success redirects to the new project; only errors come back.
    if (res && "error" in res) {
      toast.error(res.error);
      setImporting(false);
    }
  }

  const count = picked ? Object.keys(picked.files).length : 0;

  return (
    <section className="mx-auto max-w-3xl space-y-3 rounded-2xl border bg-card/60 p-4">
      <div className="flex items-center gap-2">
        <FileArchive className="size-4 text-primary" />
        <p className="text-sm font-medium">Or upload a project from your computer</p>
      </div>

      {!picked ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) void read(file);
          }}
          disabled={reading}
          className={cn(
            "flex w-full flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground transition hover:border-primary/50 hover:text-foreground",
            dragging && "border-primary bg-primary/5",
          )}
        >
          {reading ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
          <span className="font-medium text-foreground">{reading ? "Reading the ZIP…" : "Drop a .zip here, or click to choose"}</span>
          <span className="text-xs">
            Source files only: node_modules, build output and lockfiles are skipped. Up to {IMPORT_LIMITS.files} files.
          </span>
        </button>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border bg-background px-3 py-2.5 text-sm">
            <p className="font-medium">{picked.name}</p>
            <p className="text-xs text-muted-foreground">
              {count} file{count === 1 ? "" : "s"} ready{picked.skipped ? ` · ${picked.skipped} skipped` : ""} ·{" "}
              {picked.previewable ? "has a React App, so it previews in the browser" : "no React App found: it opens in the Code tab, and Architect can build a preview screen"}
            </p>
          </div>
          <Textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Optional: what should Architect do next? e.g. Add a support agent that answers questions from our docs"
            className="min-h-20 bg-background"
          />
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setPicked(null)} disabled={importing}>
              Choose another ZIP
            </Button>
            <Button onClick={submit} disabled={importing}>
              {importing ? <Loader2 className="animate-spin" /> : <Sparkles />} {goal.trim() ? "Import and plan" : "Import project"}
            </Button>
          </div>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void read(file);
          e.target.value = "";
        }}
      />
    </section>
  );
}
