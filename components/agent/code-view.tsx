"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generateCode, FRAMEWORK_LANG } from "@/lib/agent/codegen";
import { compileAgent } from "@/lib/agent/compile";
import { FRAMEWORKS } from "@/lib/catalog";
import { useTheme } from "@/lib/theme";
import { useWorkspace } from "@/lib/workspace/store";

const Editor = dynamic(() => import("@monaco-editor/react").then((m) => m.Editor), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 size-4 animate-spin" /> Loading…
    </div>
  ),
});

export function CodeView() {
  const agent = useWorkspace((s) => s.agent)!;
  const theme = useTheme();
  const code = useMemo(() => generateCode(compileAgent(agent.graph, agent.name), agent.framework), [agent]);
  const framework = FRAMEWORKS.find((f) => f.id === agent.framework)?.name ?? agent.framework;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3 text-xs text-muted-foreground">
        Generated {framework} starter — updates live as you edit the canvas
        <Button
          size="xs"
          variant="ghost"
          className="ml-auto"
          onClick={() => navigator.clipboard.writeText(code).then(() => toast.success("Copied"))}
        >
          <Copy /> Copy
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          theme={theme === "dark" ? "vs-dark" : "light"}
          language={FRAMEWORK_LANG[agent.framework] ?? "python"}
          value={code}
          options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12.5, scrollBeyondLastLine: false, automaticLayout: true, padding: { top: 12 } }}
        />
      </div>
    </div>
  );
}
