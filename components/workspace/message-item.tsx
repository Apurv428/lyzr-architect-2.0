"use client";

import { AlertTriangle, FileCode2, GitCommitVertical, History, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChangesData, ChatMessage, ErrorData, Plan, Questions, UserMessageData } from "@/lib/ai/schema";
import type { Attachment } from "@/lib/attachments";
import { SentAttachments } from "./attachments";
import type { Mode } from "@/lib/types";
import { useRestore } from "@/lib/workspace/use-restore";
import { useWorkspace } from "@/lib/workspace/store";
import { Markdown } from "./markdown";
import { PlanCard } from "./plan-card";
import { QuestionsCard } from "./questions-card";

export function AssistantAvatar() {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/15">
      <Sparkles className="size-3.5 text-primary" />
    </span>
  );
}

export function UserBubble({ text, attachments }: { text: string; attachments?: Attachment[] }) {
  return (
    <div className="space-y-1.5">
      {attachments?.length ? <SentAttachments files={attachments} /> : null}
      <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary/15 px-3.5 py-2.5 text-sm whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}

export function AssistantText({ text, live }: { text: string; live?: boolean }) {
  return (
    <div className="flex gap-2.5 text-sm">
      <AssistantAvatar />
      <div className="min-w-0 pt-1 leading-relaxed">
        <Markdown text={text} />
        {live && <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-primary" />}
      </div>
    </div>
  );
}

function ChangesCard({ data, mode }: { data: ChangesData; mode: Mode }) {
  const isCurrent = useWorkspace((s) => s.checkpointId === data.checkpointId);
  const streaming = useWorkspace((s) => s.streaming);
  const { restore, restoring } = useRestore();
  return (
    <div className="ml-9 overflow-hidden rounded-xl border bg-card/70 text-sm">
      <div className="flex items-center gap-2 border-b px-3.5 py-2">
        <GitCommitVertical className="size-4 text-emerald-600 dark:text-emerald-400" />
        <span className="font-medium">{data.label}</span>
        {isCurrent ? (
          <span className="ml-auto text-xs text-emerald-600 dark:text-emerald-400">Current version</span>
        ) : (
          <button
            onClick={() => restore(data.checkpointId)}
            disabled={streaming || !!restoring}
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {restoring ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />} Restore this version
          </button>
        )}
      </div>
      <div className="space-y-3 px-3.5 py-3">
        <div>
          <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">What changed</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {data.summary.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
        {mode === "pro" && (
          <div className="flex flex-wrap gap-1.5">
            {data.files.map((f) => (
              <span key={f} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                <FileCode2 className="size-3" /> {f}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ErrorCard({ text, onRetry, disabled }: { text: string; onRetry: () => void; disabled: boolean }) {
  return (
    <div className="ml-9 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <p className="flex-1">{text}</p>
      <Button size="sm" variant="outline" onClick={onRetry} disabled={disabled}>
        <RotateCcw /> Retry
      </Button>
    </div>
  );
}

export function MessageItem({
  message,
  mode,
  planState,
  busy,
  onApprove,
  onRefine,
  onRetry,
  questionsOpen = false,
  onAnswer = () => {},
  onSkip = () => {},
  onSavePlan,
}: {
  message: ChatMessage;
  mode: Mode;
  planState: "actionable" | "approved" | "superseded";
  busy: boolean;
  onApprove: () => void;
  onRefine: () => void;
  onRetry: (data: ErrorData) => void;
  questionsOpen?: boolean;
  onAnswer?: (text: string) => void;
  onSkip?: () => void;
  onSavePlan?: (plan: Plan) => Promise<boolean>;
}) {
  if (message.role === "user") return <UserBubble text={message.content ?? ""} attachments={(message.data as UserMessageData | null)?.attachments} />;

  switch (message.kind) {
    case "questions":
      return (
        <div className="ml-9">
          <QuestionsCard data={message.data as Questions} open={questionsOpen} busy={busy} onAnswer={onAnswer} onSkip={onSkip} />
        </div>
      );
    case "plan":
      return (
        <div className="ml-9">
          <PlanCard
            plan={message.data as Plan}
            mode={mode}
            state={planState}
            busy={busy}
            onApprove={onApprove}
            onRefine={onRefine}
            onSave={onSavePlan}
          />
        </div>
      );
    case "checkpoint":
      return (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          <span className="inline-flex items-center gap-1.5">
            <History className="size-3.5" /> {message.content}
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
      );
    case "changes":
      return <ChangesCard data={message.data as ChangesData} mode={mode} />;
    case "error":
      return <ErrorCard text={message.content ?? ""} disabled={busy} onRetry={() => onRetry(message.data as ErrorData)} />;
    default:
      return <AssistantText text={message.content ?? ""} />;
  }
}
