"use client";

import { useState } from "react";
import { MessageSquare, PanelRight } from "lucide-react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import type { CheckpointMeta } from "@/lib/actions/checkpoints";
import type { AgentRecord } from "@/lib/agent/types";
import type { ChatMessage, FileMap } from "@/lib/ai/schema";
import type { Mode } from "@/lib/types";
import { useWorkspace } from "@/lib/workspace/store";
import { cn } from "@/lib/utils";
import { ChatPanel } from "./chat-panel";
import { RightPane } from "./right-pane";
import { TopBar } from "./top-bar";
import { WorkspaceTour } from "@/components/app/tour";

export type WorkspaceProps = {
  projectId: string;
  name: string;
  mode: Mode;
  githubRepo: string | null;
  thumbnailUrl: string | null;
  messages: ChatMessage[];
  files: FileMap;
  prevFiles: FileMap;
  checkpointId: string | null;
  checkpoints: CheckpointMeta[];
  agent: AgentRecord | null;
  credits: number;
  tourCompleted: boolean;
};

export function Workspace({ tourCompleted, ...props }: WorkspaceProps) {
  // Initialise synchronously so the first render already has project data.
  const [ready] = useState(() => {
    useWorkspace.getState().init(props);
    return true;
  });
  const [mobileView, setMobileView] = useState<"chat" | "app">("chat");

  if (!ready) return null;
  return (
    <div className="flex h-dvh flex-col">
      <TopBar />
      <WorkspaceTour completed={tourCompleted} />

      <div className="hidden min-h-0 flex-1 md:block">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize="36" minSize="26" maxSize="55">
            <ChatPanel />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="64" minSize="35">
            <RightPane />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        <div className="min-h-0 flex-1">{mobileView === "chat" ? <ChatPanel /> : <RightPane />}</div>
        <div className="grid grid-cols-2 border-t p-1.5">
          {([
            ["chat", "Chat", MessageSquare],
            ["app", "App", PanelRight],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setMobileView(id)}
              className={cn("flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm", mobileView === id ? "bg-muted" : "text-muted-foreground")}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
