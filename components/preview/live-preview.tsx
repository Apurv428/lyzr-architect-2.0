"use client";

import { useEffect, useRef } from "react";
import { SandpackPreview, SandpackProvider, useSandpack } from "@codesandbox/sandpack-react";
import { AlertTriangle, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FileMap } from "@/lib/ai/schema";
import { SANDBOX_DEPENDENCIES, SANDBOX_RESOURCES, sandboxFiles, type SelectedElement } from "@/lib/workspace/sandbox";

type Props = {
  files: FileMap;
  selectMode?: boolean;
  onSelect?: (el: SelectedElement) => void;
  onAutoFix?: (error: string) => void;
  /** Ask the sandbox for a thumbnail once it has rendered this version. */
  onCapture?: (dataUrl: string) => void;
};

function PreviewBridge({ selectMode, onSelect, onAutoFix, onCapture }: Omit<Props, "files">) {
  const { sandpack } = useSandpack();
  const container = useRef<HTMLDivElement>(null);
  const captured = useRef(false);
  const iframe = () => container.current?.querySelector("iframe") ?? null;

  useEffect(() => {
    iframe()?.contentWindow?.postMessage({ type: "architect:select-mode", on: !!selectMode }, "*");
  }, [selectMode]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== iframe()?.contentWindow) return;
      if (e.data?.type === "architect:selected") onSelect?.(e.data.element as SelectedElement);
      if (e.data?.type === "architect:ready" && onCapture && !captured.current) {
        captured.current = true;
        iframe()?.contentWindow?.postMessage({ type: "architect:capture" }, "*");
      }
      if (e.data?.type === "architect:captured" && typeof e.data.dataUrl === "string") onCapture?.(e.data.dataUrl);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onSelect, onCapture]);

  const error = sandpack.error;
  const errorText = error ? [error.title, error.path && `in ${error.path}${error.line ? `:${error.line}` : ""}`, error.message].filter(Boolean).join("\n") : "";

  return (
    <div ref={container} className="relative h-full">
      <SandpackPreview
        className="!h-full"
        style={{ height: "100%" }}
        showOpenInCodeSandbox={false}
        showRefreshButton={false}
        showSandpackErrorOverlay={false}
      />
      {error && (
        <div className="absolute inset-x-3 bottom-3 rounded-xl border border-destructive/40 bg-background/95 p-4 text-sm shadow-2xl backdrop-blur">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Something broke in the preview</p>
              <pre className="mt-1 max-h-24 overflow-auto font-mono text-xs whitespace-pre-wrap text-muted-foreground">{errorText}</pre>
            </div>
            {onAutoFix && (
              <Button size="sm" onClick={() => onAutoFix(errorText)}>
                <Wand2 /> Auto-fix
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function LivePreview({ files, ...rest }: Props) {
  return (
    <SandpackProvider
      template="react-ts"
      files={sandboxFiles(files)}
      customSetup={{ dependencies: SANDBOX_DEPENDENCIES }}
      options={{ recompileMode: "immediate", initMode: "immediate", externalResources: SANDBOX_RESOURCES }}
      className="!h-full"
      style={{ height: "100%" }}
    >
      <PreviewBridge {...rest} />
    </SandpackProvider>
  );
}
