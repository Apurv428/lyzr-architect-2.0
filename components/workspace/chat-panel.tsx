"use client";

import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import type { ChangesData, ChatMessage, ErrorData } from "@/lib/ai/schema";
import { toast } from "sonner";
import { updatePlan } from "@/lib/actions/plan";
import { useChat } from "@/lib/workspace/use-chat";
import { useWorkspace } from "@/lib/workspace/store";
import { Composer, type ComposerHandle } from "./composer";
import { AssistantAvatar, AssistantText, MessageItem } from "./message-item";

type PlanState = "actionable" | "approved" | "superseded";

function planStates(messages: ChatMessage[]) {
  const states = new Map<string, PlanState>();
  let latestPlan: string | null = null;
  for (const m of messages) {
    if (m.kind === "plan") {
      if (latestPlan && states.get(latestPlan) === "actionable") states.set(latestPlan, "superseded");
      latestPlan = m.id;
      states.set(m.id, "actionable");
    } else if (latestPlan && (m.kind === "changes" || (m.role === "user" && (m.data as { approved?: boolean })?.approved))) {
      states.set(latestPlan, "approved");
    }
  }
  return states;
}

export function ChatPanel() {
  const messages = useWorkspace((s) => s.messages);
  const mode = useWorkspace((s) => s.mode);
  const liveText = useWorkspace((s) => s.liveText);
  const status = useWorkspace((s) => s.status);
  const { send, cancel, streaming } = useChat();
  const composer = useRef<ComposerHandle>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const states = useMemo(() => planStates(messages), [messages]);

  // ⌘. / Ctrl+. — stop generation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "." && streaming) {
        e.preventDefault();
        cancel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [streaming, cancel]);

  const lastChanges = [...messages].reverse().find((m) => m.kind === "changes" || m.role === "user");
  const suggestions =
    !streaming && lastChanges?.kind === "changes" ? (lastChanges.data as ChangesData).suggestions : [];

  // Kick off the first plan for a freshly created project.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const conversational = messages.filter((m) => m.role !== "system");
    const onlyPrompt = conversational.length === 1 && conversational[0].role === "user";
    if (onlyPrompt) send("start");
  }, [messages, send]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, liveText, status]);

  const retry = (data: ErrorData) => send(data.retry, data.input, { retry: true });
  // A question card stays answerable until the user sends anything after it.
  const lastConversational = [...messages].reverse().find((m) => m.role !== "system");
  const openQuestionsId = lastConversational?.kind === "questions" ? lastConversational.id : null;

  return (
    <div className="flex h-full flex-col">
      <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((m) => (
          <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
            <MessageItem
              message={m}
              mode={mode}
              planState={states.get(m.id) ?? "superseded"}
              busy={streaming}
              onApprove={() => send("approve")}
              onRefine={() => composer.current?.focusWith("Change the plan: ")}
              onRetry={retry}
              questionsOpen={m.id === openQuestionsId}
              onAnswer={(text) => send("message", text, { intent: "answers" })}
              onSkip={() => send("message", "Skip the questions — make sensible assumptions and plan it.", { intent: "skip" })}
              onSavePlan={async (plan) => {
                const res = await updatePlan(useWorkspace.getState().projectId, m.id, plan);
                if ("error" in res) {
                  toast.error(res.error);
                  return false;
                }
                useWorkspace.getState().patchMessage(m.id, { data: res.plan, content: res.plan.summary });
                toast.success("Plan updated — approve when it looks right");
                return true;
              }}
            />
          </motion.div>
        ))}

        {liveText && <AssistantText text={liveText} live />}

        <AnimatePresence>
          {streaming && status && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2.5 text-sm text-muted-foreground"
            >
              {!liveText && <AssistantAvatar />}
              <span className={liveText ? "ml-9 inline-flex items-center gap-2" : "inline-flex items-center gap-2"}>
                <Loader2 className="size-3.5 animate-spin text-primary" />
                <motion.span key={status} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                  {status}
                </motion.span>
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {suggestions.length > 0 && (
          <div className="ml-9 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send("message", s)}
                className="rounded-full border bg-card/50 px-3 py-1 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t p-3">
        <Composer ref={composer} busy={streaming} onSend={(text, attachments) => send("message", text, { attachments })} />
      </div>
    </div>
  );
}
