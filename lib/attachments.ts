import type { ChatMessage, UserMessageData } from "@/lib/ai/schema";

export type Attachment = { path: string; mime: string; name: string; size: number };

export const ATTACHMENT_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "text/plain", "text/markdown"] as const;
export const MAX_ATTACHMENTS = 3;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export const isImage = (mime: string) => mime.startsWith("image/");

/**
 * Attachments stay in play until a build has used them: the screenshot sent with the idea
 * is re-sent when the plan is approved, then dropped to keep later turns cheap.
 */
export function activeAttachments(history: ChatMessage[]): Attachment[] | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.kind === "changes") return undefined;
    const files = m.role === "user" ? (m.data as UserMessageData | null)?.attachments : undefined;
    if (files?.length) return files;
  }
  return undefined;
}
