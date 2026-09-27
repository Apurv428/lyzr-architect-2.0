"use client";

import { create } from "zustand";
import type { ChatMessage, FileMap } from "@/lib/ai/schema";
import type { CheckpointMeta } from "@/lib/actions/checkpoints";
import type { AgentRecord } from "@/lib/agent/types";
import type { SelectedElement } from "./sandbox";
import type { Mode } from "@/lib/types";

export type Tab = "preview" | "code" | "agent" | "data" | "deploy";
export type Device = "desktop" | "tablet" | "mobile";
export type PreviewRuntime = "sandpack" | "webcontainer" | "e2b";

type WorkspaceState = {
  projectId: string;
  name: string;
  mode: Mode;
  githubRepo: string | null;
  thumbnailUrl: string | null;
  messages: ChatMessage[];
  files: FileMap;
  /** Files as of the checkpoint before the current one — the base for diffs. */
  prevFiles: FileMap;
  checkpointId: string | null;
  checkpoints: CheckpointMeta[];
  agent: AgentRecord | null;
  credits: number;
  device: Device;
  selectMode: boolean;
  selection: SelectedElement | null;
  previewKey: number;
  dialog: "deploy" | "publish" | "invite" | null;
  /** Bumped after a deploy so the Deploy tab refetches. */
  deployVersion: number;
  previewRuntime: PreviewRuntime;
  streaming: boolean;
  liveText: string;
  status: string | null;
  tab: Tab;
  draft: string;
};

type WorkspaceActions = {
  init: (
    s: Pick<WorkspaceState, "projectId" | "name" | "mode" | "githubRepo" | "thumbnailUrl" | "messages" | "files" | "prevFiles" | "checkpointId" | "checkpoints" | "agent" | "credits">,
  ) => void;
  applyFiles: (files: FileMap, checkpoint: CheckpointMeta) => void;
  set: (s: Partial<WorkspaceState>) => void;
  upsertMessage: (m: ChatMessage) => void;
  patchMessage: (id: string, patch: Partial<ChatMessage>) => void;
};

export const useWorkspace = create<WorkspaceState & WorkspaceActions>((set) => ({
  projectId: "",
  name: "",
  mode: "guided",
  githubRepo: null,
  thumbnailUrl: null,
  messages: [],
  files: {},
  prevFiles: {},
  checkpointId: null,
  checkpoints: [],
  agent: null,
  credits: 0,
  device: "desktop",
  selectMode: false,
  selection: null,
  previewKey: 0,
  dialog: null,
  deployVersion: 0,
  previewRuntime: "sandpack",
  streaming: false,
  liveText: "",
  status: null,
  tab: "preview",
  draft: "",
  init: (s) =>
    set({ ...s, streaming: false, liveText: "", status: null, tab: "preview", draft: "", selectMode: false, selection: null }),
  applyFiles: (files, checkpoint) =>
    set((state) => ({
      prevFiles: state.files,
      files,
      checkpointId: checkpoint.id,
      checkpoints: [...state.checkpoints, checkpoint],
      selection: null,
      selectMode: false,
    })),
  set: (s) => set(s),
  patchMessage: (id, patch) => set((state) => ({ messages: state.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
  upsertMessage: (m) =>
    set((state) => {
      // Server-confirmed user message replaces its optimistic twin.
      const optimistic = m.role === "user" ? state.messages.findIndex((x) => x.id.startsWith("tmp-")) : -1;
      if (optimistic >= 0) {
        const messages = [...state.messages];
        messages[optimistic] = m;
        return { messages };
      }
      return { messages: [...state.messages, m] };
    }),
}));
