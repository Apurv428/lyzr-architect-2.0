import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_ATTACHMENTS, type Attachment } from "@/lib/attachments";

export type LoadedAttachment = Attachment & { base64: string; text?: string };

const TOTAL_LIMIT = 12 * 1024 * 1024;

/** Downloads the current turn's attachments. Only files in the caller's own folder are accepted. */
export async function loadAttachments(supabase: SupabaseClient, userId: string, list: Attachment[] | undefined) {
  const wanted = (list ?? []).filter((a) => a.path.startsWith(`${userId}/`)).slice(0, MAX_ATTACHMENTS);
  const loaded: LoadedAttachment[] = [];
  let total = 0;
  for (const a of wanted) {
    const { data, error } = await supabase.storage.from("attachments").download(a.path);
    if (error || !data) continue;
    const bytes = Buffer.from(await data.arrayBuffer());
    total += bytes.length;
    if (total > TOTAL_LIMIT) break;
    const isText = a.mime === "text/plain" || a.mime === "text/markdown";
    loaded.push({ ...a, base64: bytes.toString("base64"), text: isText ? bytes.toString("utf8").slice(0, 60_000) : undefined });
  }
  return loaded;
}

type ImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export function toClaudeBlocks(files: LoadedAttachment[]): Anthropic.Beta.BetaContentBlockParam[] {
  return files.map((f): Anthropic.Beta.BetaContentBlockParam => {
    if (f.mime.startsWith("image/")) return { type: "image", source: { type: "base64", media_type: f.mime as ImageMime, data: f.base64 } };
    if (f.mime === "application/pdf") return { type: "document", title: f.name, source: { type: "base64", media_type: "application/pdf", data: f.base64 } };
    return { type: "text", text: `<attachment name="${f.name}">\n${f.text ?? ""}\n</attachment>` };
  });
}

export function toOpenAIParts(files: LoadedAttachment[]): OpenAI.Chat.Completions.ChatCompletionContentPart[] {
  return files.map((f): OpenAI.Chat.Completions.ChatCompletionContentPart => {
    if (f.mime.startsWith("image/")) return { type: "image_url", image_url: { url: `data:${f.mime};base64,${f.base64}` } };
    if (f.mime === "application/pdf") return { type: "file", file: { filename: f.name, file_data: `data:application/pdf;base64,${f.base64}` } };
    return { type: "text", text: `<attachment name="${f.name}">\n${f.text ?? ""}\n</attachment>` };
  });
}
