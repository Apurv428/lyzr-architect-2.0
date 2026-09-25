import { z } from "zod";
import type { Attachment } from "@/lib/attachments";

// ── Tool inputs (validated server-side before anything is persisted) ──

export const PlanSchema = z.object({
  summary: z.string().min(1),
  screens: z.array(z.object({ name: z.string(), purpose: z.string() })).min(1),
  data: z.array(z.object({ entity: z.string(), fields: z.array(z.string()) })),
  agent: z.object({
    name: z.string(),
    goal: z.string(),
    steps: z.array(z.string()).min(1),
    tools: z.array(z.string()),
  }),
  rules: z.array(z.string()),
  integrations: z.array(z.string()),
  assumptions: z.array(z.string()),
  /** Set by the app when the user edits the plan card; the model never sends it. */
  edited: z.boolean().optional(),
});
export type Plan = z.infer<typeof PlanSchema>;

export const QuestionsSchema = z.object({
  intro: z.string().optional(),
  questions: z
    .array(
      z.object({
        id: z.string().min(1),
        question: z.string().min(1),
        options: z.array(z.string().min(1)).min(2).max(5),
        allow_other: z.boolean(),
      }),
    )
    .min(1)
    .max(3),
});
export type Questions = z.infer<typeof QuestionsSchema>;

export const WriteFilesSchema = z.object({
  checkpoint_label: z.string().min(1),
  summary: z.array(z.string()).min(1),
  files: z
    .array(
      z.object({
        path: z.string().regex(/^\/[\w\-./]+\.(tsx|ts|css)$/, "path must look like /App.tsx"),
        content: z.string(),
      }),
    )
    .min(1),
  deleted: z.array(z.string()).optional(),
  next_suggestions: z.array(z.string()).max(4),
});
export type WriteFiles = z.infer<typeof WriteFilesSchema>;

// ── Persisted chat messages ──

export type MessageKind = "text" | "plan" | "progress" | "changes" | "error" | "checkpoint" | "questions";

export type ChangesData = {
  label: string;
  summary: string[];
  files: string[];
  suggestions: string[];
  checkpointId: string;
};

export type ErrorData = { retry: "start" | "message" | "approve"; input?: string };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  kind: MessageKind;
  content: string | null;
  data: Plan | Questions | ChangesData | ErrorData | UserMessageData | null;
  created_at: string;
};

export type FileMap = Record<string, string>;

export type UserMessageData = { approved?: boolean; attachments?: Attachment[] };

// ── NDJSON events streamed from /api/chat to the workspace ──

export type ChatAction = "start" | "message" | "approve";

export type ChatEvent =
  | { t: "message"; message: ChatMessage }
  | { t: "status"; label: string }
  | { t: "text"; delta: string }
  | { t: "files"; files: FileMap; checkpoint: { id: string; label: string; created_at: string } }
  | { t: "credits"; credits: number }
  | { t: "done" };
