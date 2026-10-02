"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import type { ChatAction, ChatEvent } from "@/lib/ai/schema";
import type { Attachment } from "@/lib/attachments";
import { useWorkspace } from "./store";

// The desktop and mobile layouts each mount a chat panel, so the stream is shared: whichever panel
// started it, Stop in the visible one cancels it.
let active: AbortController | null = null;

export function useChat() {
  const streaming = useWorkspace((s) => s.streaming);

  const cancel = useCallback(() => {
    active?.abort();
  }, []);

  const send = useCallback(async (action: ChatAction, input?: string, opts?: { retry?: boolean; intent?: "answers" | "skip" | "fix" | "edit"; attachments?: Attachment[] }) => {
    const store = useWorkspace.getState();
    if (store.streaming) return;

    if (action !== "start" && !opts?.retry) {
      store.upsertMessage({
        id: `tmp-${Date.now()}`,
        role: "user",
        kind: "text",
        content: action === "approve" ? "Looks good — build it." : input!,
        data: action === "approve" ? { approved: true } : opts?.attachments?.length ? { attachments: opts.attachments } : null,
        created_at: new Date().toISOString(),
      });
    }
    store.set({ streaming: true, liveText: "", status: "Thinking…" });

    const controller = new AbortController();
    active = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: store.projectId, action, input, retry: opts?.retry, intent: opts?.intent, attachments: opts?.attachments }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const { error } = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(error);
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) apply(JSON.parse(line) as ChatEvent);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return; // User cancelled — no toast
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      // Drop the optimistic message the server never confirmed.
      useWorkspace.setState((s) => ({ messages: s.messages.filter((m) => !m.id.startsWith("tmp-")) }));
    } finally {
      if (active === controller) active = null;
      useWorkspace.getState().set({ streaming: false, liveText: "", status: null });
    }
  }, []);

  return { send, cancel, streaming };
}

function apply(event: ChatEvent) {
  const s = useWorkspace.getState();
  switch (event.t) {
    case "text":
      s.set({ liveText: s.liveText + event.delta });
      break;
    case "status":
      s.set({ status: event.label });
      break;
    case "message":
      s.upsertMessage(event.message);
      if (event.message.role === "assistant" && event.message.kind === "text") s.set({ liveText: "" });
      break;
    case "files":
      s.applyFiles(event.files, event.checkpoint);
      break;
    case "credits":
      s.set({ credits: event.credits });
      break;
  }
}
