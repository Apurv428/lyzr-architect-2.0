"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Eye, ExternalLink, Loader2, Monitor, MousePointerClick, RotateCw, Smartphone, Tablet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SelectedElement } from "@/lib/workspace/sandbox";
import { trackClientEvent } from "@/lib/actions/events";
import { useChat } from "@/lib/workspace/use-chat";
import { saveThumbnail } from "@/lib/workspace/thumbnail";
import { useWorkspace, type Device, type PreviewRuntime } from "@/lib/workspace/store";
import { cn } from "@/lib/utils";

/** WebContainers need a cross-origin isolated page, and only a fresh load can turn that on or off (see next.config.ts). */
function switchRuntime(next: PreviewRuntime) {
  if ((next === "webcontainer") !== window.crossOriginIsolated) {
    const url = new URL(window.location.href);
    if (next === "webcontainer") url.searchParams.set("runtime", "webcontainer");
    else url.searchParams.delete("runtime");
    window.location.assign(url);
    return;
  }
  useWorkspace.getState().set({ previewRuntime: next });
}

const LivePreview = dynamic(() => import("@/components/preview/live-preview").then((m) => m.LivePreview), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 size-4 animate-spin" /> Starting preview…
    </div>
  ),
});

const WebContainerPreview = dynamic(
  () => import("@/components/preview/webcontainer-preview").then((m) => m.WebContainerPreview),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" /> Booting WebContainer…</div> },
);

const E2BPreview = dynamic(
  () => import("@/components/preview/webcontainer-preview").then((m) => m.E2BPreview),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" /> Starting sandbox…</div> },
);

const DEVICES: { id: Device; icon: typeof Monitor; label: string; width: string }[] = [
  { id: "desktop", icon: Monitor, label: "Desktop", width: "100%" },
  { id: "tablet", icon: Tablet, label: "Tablet", width: "820px" },
  { id: "mobile", icon: Smartphone, label: "Mobile", width: "390px" },
];

function describeSelection(el: SelectedElement) {
  const text = el.text ? ` “${el.text.slice(0, 40)}${el.text.length > 40 ? "…" : ""}”` : "";
  return `<${el.tag}>${text}`;
}

function SelectionPrompt({ selection }: { selection: SelectedElement }) {
  const { send, streaming } = useChat();
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), [selection]);

  function submit() {
    if (!value.trim() || streaming) return;
    const context = [
      `Change this element in the preview: <${selection.tag}>`,
      selection.text && `with text "${selection.text}"`,
      selection.classes && `(classes: ${selection.classes})`,
      `at ${selection.path}.`,
    ]
      .filter(Boolean)
      .join(" ");
    send("message", `${value.trim()}\n\n${context}`);
    useWorkspace.getState().set({ selection: null, selectMode: false });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      className="absolute inset-x-4 bottom-4 z-10 mx-auto max-w-lg rounded-xl border bg-popover/95 p-2 shadow-2xl backdrop-blur"
    >
      <div className="flex items-center gap-2 px-1.5 pb-2 text-xs text-muted-foreground">
        <MousePointerClick className="size-3.5 text-primary" />
        Selected <span className="truncate font-mono text-foreground">{describeSelection(selection)}</span>
        <button className="ml-auto hover:text-foreground" aria-label="Clear selection" onClick={() => useWorkspace.getState().set({ selection: null })}>
          <X className="size-3.5" />
        </button>
      </div>
      <div className="flex gap-2">
        <input
          ref={input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="What should change? e.g. “make this bigger and green”"
          className="h-9 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus:border-primary"
        />
        <Button size="icon-lg" onClick={submit} disabled={!value.trim() || streaming} aria-label="Ask Architect">
          <ArrowUp />
        </Button>
      </div>
    </motion.div>
  );
}

export function PreviewTab() {
  const files = useWorkspace((s) => s.files);
  const projectId = useWorkspace((s) => s.projectId);
  const checkpointId = useWorkspace((s) => s.checkpointId);
  const streaming = useWorkspace((s) => s.streaming);
  const device = useWorkspace((s) => s.device);
  const selectMode = useWorkspace((s) => s.selectMode);
  const selection = useWorkspace((s) => s.selection);
  const previewKey = useWorkspace((s) => s.previewKey);
  const previewRuntime = useWorkspace((s) => s.previewRuntime);
  const { send } = useChat();
  const hasFiles = Object.keys(files).length > 0;

  // Brief highlight whenever a new version lands.
  const [flash, setFlash] = useState(false);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 900);
    return () => clearTimeout(t);
  }, [checkpointId]);

  // Capture a dashboard thumbnail once per version, at desktop size only.
  const thumbnailUrl = useWorkspace((s) => s.thumbnailUrl);
  const needsThumbnail = device === "desktop" && !!checkpointId && !thumbnailUrl?.includes(`v=${checkpointId.slice(0, 8)}`);
  const onCapture = useCallback(
    async (dataUrl: string) => {
      if (!checkpointId) return;
      const url = await saveThumbnail(projectId, checkpointId, dataUrl);
      if (url) useWorkspace.getState().set({ thumbnailUrl: url });
    },
    [projectId, checkpointId],
  );

  const onSelect = useCallback((el: SelectedElement) => useWorkspace.getState().set({ selection: el }), []);
  const onAutoFix = useCallback(
    (error: string) => {
      void trackClientEvent("autofix_clicked", projectId);
      send("message", `The preview shows this error — please fix it:\n\n${error}`);
    },
    [send, projectId],
  );

  if (!hasFiles) {
    return (
      <div className="bg-grid flex h-full items-center justify-center p-6">
        <div className="max-w-xs text-center">
          <span className="mx-auto mb-3 grid size-11 place-items-center rounded-xl border bg-card">
            {streaming ? <Loader2 className="size-5 animate-spin text-primary" /> : <Eye className="size-5 text-primary" />}
          </span>
          <p className="font-medium">{streaming ? "Working on it…" : "Nothing to preview yet"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {streaming
              ? "Your preview appears here as soon as the first build finishes."
              : "Approve the plan in the chat and Architect will build your app here."}
          </p>
        </div>
      </div>
    );
  }

  const width = DEVICES.find((d) => d.id === device)!.width;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b px-2">
        {DEVICES.map(({ id, icon: Icon, label }) => (
          <Tooltip key={id}>
            <TooltipTrigger
              render={
                <Button
                  size="icon-xs"
                  variant={device === id ? "secondary" : "ghost"}
                  aria-label={label}
                  onClick={() => useWorkspace.getState().set({ device: id })}
                />
              }
            >
              <Icon />
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ))}
        <div className="mx-1 h-4 w-px bg-border" />
        {previewRuntime === "sandpack" && (
          <Button
            size="xs"
            data-tour="select"
            variant={selectMode ? "default" : "ghost"}
            onClick={() => useWorkspace.getState().set({ selectMode: !selectMode, selection: null })}
          >
            <MousePointerClick /> {selectMode ? "Click an element…" : "Select to edit"}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-1">
          {/* Runtime switcher */}
          <select
            value={previewRuntime}
            onChange={(e) => switchRuntime(e.target.value as PreviewRuntime)}
            className="h-6 rounded border bg-background px-1.5 text-[11px] text-muted-foreground"
            title="Preview runtime"
          >
            <option value="sandpack">Sandpack (React)</option>
            <option value="webcontainer">WebContainer</option>
            <option value="e2b">E2B Sandbox</option>
          </select>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Reload preview"
                  onClick={() => useWorkspace.getState().set({ previewKey: previewKey + 1, selectMode: false, selection: null })}
                />
              }
            >
              <RotateCw />
            </TooltipTrigger>
            <TooltipContent>Reload</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={<a href={`/p/${projectId}/preview`} target="_blank" rel="noreferrer" aria-label="Open in new tab" className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" />}
            >
              <ExternalLink className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>Open in new tab</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className={cn("relative min-h-0 flex-1", device !== "desktop" && previewRuntime === "sandpack" && "bg-grid flex justify-center overflow-auto p-4")}>
        <div
          className={cn(
            "relative h-full overflow-hidden bg-white transition-all duration-300",
            device !== "desktop" && previewRuntime === "sandpack" && "rounded-2xl border-4 border-zinc-800 shadow-2xl",
            flash && "ring-2 ring-primary ring-offset-2 ring-offset-background",
            selectMode && previewRuntime === "sandpack" && "ring-2 ring-primary/70",
          )}
          style={{ width: previewRuntime === "sandpack" ? width : "100%", maxWidth: "100%" }}
        >
          {previewRuntime === "sandpack" && (
            <LivePreview
              key={`${checkpointId}-${previewKey}`}
              files={files}
              selectMode={selectMode}
              onSelect={onSelect}
              onAutoFix={streaming ? undefined : onAutoFix}
              onCapture={needsThumbnail ? onCapture : undefined}
            />
          )}
          {previewRuntime === "webcontainer" && (
            <WebContainerPreview key={`wc-${checkpointId}-${previewKey}`} files={files} projectId={projectId} />
          )}
          {previewRuntime === "e2b" && (
            <E2BPreview key={`e2b-${checkpointId}-${previewKey}`} files={files} projectId={projectId} />
          )}
        </div>
        <AnimatePresence>{selection && previewRuntime === "sandpack" && <SelectionPrompt selection={selection} />}</AnimatePresence>
      </div>
    </div>
  );
}
