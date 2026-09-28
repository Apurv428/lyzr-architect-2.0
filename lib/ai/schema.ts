import { z } from "zod";
import type { Attachment } from "@/lib/attachments";

// ── Tool inputs (validated server-side before anything is persisted) ──

// Some OpenAI-compatible providers (Gemini) flatten small objects into strings ("Dashboard: today's
// tickets"), send a lone string where a list belongs, or leave lists out. The plan is normalized
// back into shape; only the parts the build can't do without stay required.

const toList = (v: unknown) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const list = <T extends z.ZodType>(item: T, min = 0) => z.preprocess(toList, z.array(item).min(min));

/** "Name: detail", "Name — detail", "Name - detail" or "Name (detail)" → [name, detail]. */
export function splitLabel(s: string): [string, string] {
  const m = s.match(/^\s*(.+?)\s*(?::|—|–|\s-\s)\s*([\s\S]+?)\s*$/) ?? s.match(/^\s*(.+?)\s*\(([\s\S]+)\)\s*$/);
  return m ? [m[1], m[2]] : [s.trim(), ""];
}

const Screen = z.preprocess(
  (v) => (typeof v === "string" ? { name: splitLabel(v)[0], purpose: splitLabel(v)[1] } : v),
  z.object({ name: z.string().min(1), purpose: z.string().default("") }),
);

const Entity = z.preprocess(
  (v) => {
    if (typeof v === "string") v = { entity: splitLabel(v)[0], fields: splitLabel(v)[1] };
    if (v && typeof v === "object" && typeof (v as { fields?: unknown }).fields === "string") {
      const fields = (v as { fields: string }).fields;
      v = { ...v, fields: fields.split(/\s*,\s*/).filter(Boolean) };
    }
    return v;
  },
  z.object({ entity: z.string().min(1), fields: list(z.string()) }),
);

export const PlanSchema = z.object({
  summary: z.string().min(1),
  screens: list(Screen, 1),
  data: list(Entity),
  agent: z.object({
    name: z.string().default("Your agent"),
    goal: z.string().default(""),
    steps: list(z.string(), 1),
    tools: list(z.string()),
  }),
  rules: list(z.string()),
  integrations: list(z.string()),
  assumptions: list(z.string()),
  /** Set by the app when the user edits the plan card; the model never sends it. */
  edited: z.boolean().optional(),
});
export type Plan = z.infer<typeof PlanSchema>;

/**
 * Things the app can't work without, typed in rather than picked. A `slack_webhook` is saved
 * encrypted with the project and never reaches the chat; everything else is answered in the chat.
 */
export const FIELD_TYPES = ["slack_webhook", "text", "time"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const QuestionsSchema = z
  .object({
    intro: z.string().optional(),
    questions: z
      .array(
        z.object({
          id: z.string().min(1),
          question: z.string().min(1),
          options: z.array(z.string().min(1)).min(2).transform((o) => o.slice(0, 5)),
          allow_other: z.boolean().default(true),
        }),
      )
      .max(3)
      .default([]),
    fields: z
      .array(
        z.object({
          id: z.string().min(1),
          label: z.string().min(1),
          type: z.enum(FIELD_TYPES).catch("text"),
          placeholder: z.string().optional(),
        }),
      )
      .max(4)
      // One project has one Slack webhook.
      .transform((f) => f.filter((x, i) => x.type !== "slack_webhook" || f.findIndex((y) => y.type === "slack_webhook") === i))
      .optional(),
  })
  .refine((q) => q.questions.length + (q.fields?.length ?? 0) > 0, "Ask at least one question.");
export type Questions = z.infer<typeof QuestionsSchema>;

// Files are strict. The descriptive fields get fallbacks, because some OpenAI-compatible providers
// (Gemini) leave out "required" fields that only describe the change.
export const WriteFilesSchema = z
  .object({
    checkpoint_label: z.string().optional(),
    // Gemini sends a single string here on edit turns; a lone string becomes a one-item list.
    summary: list(z.string()).optional(),
    files: z
      .array(
        z.object({
          // .jsx/.js/.json/.md/.html too, so imported projects can be edited in their own formats.
          path: z
            .string()
            .regex(/^\/[\w\-./]+\.(tsx|ts|jsx|js|mjs|css|json|md|html)$/, "path must look like /App.tsx")
            .refine((p) => !p.includes("..") && !p.startsWith("/__architect__/"), "path must stay inside the app"),
          content: z.string(),
        }),
      )
      .min(1),
    deleted: list(z.string()).optional(),
    next_suggestions: list(z.string()).optional(),
  })
  .transform((w) => ({
    ...w,
    checkpoint_label: w.checkpoint_label?.trim() || "Updated the app",
    summary: w.summary?.length ? w.summary : w.files.map((f) => `Updated ${f.path}`),
    next_suggestions: (w.next_suggestions ?? []).slice(0, 4),
  }));
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
