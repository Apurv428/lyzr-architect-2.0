"use client";

import { ATTACHMENT_MIME, MAX_ATTACHMENT_BYTES, type Attachment } from "@/lib/attachments";
import { createClient } from "@/lib/supabase/client";

const LONG_EDGE = 1568;

/** Downscale large photos/screenshots so they upload fast and cost fewer model tokens. */
async function shrinkImage(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 1_500_000) return file;
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.convertToBlob({ type: "image/webp", quality: 0.85 });
}

export async function uploadAttachment(file: File): Promise<Attachment> {
  const mime = file.type || (file.name.endsWith(".md") ? "text/markdown" : "");
  if (!(ATTACHMENT_MIME as readonly string[]).includes(mime)) throw new Error(`${file.name}: use an image, PDF, or text file.`);

  const body = mime.startsWith("image/") ? await shrinkImage(file) : file;
  if (body.size > MAX_ATTACHMENT_BYTES) throw new Error(`${file.name} is over 5 MB.`);
  const type = body.type || mime;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to attach files.");

  const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-60);
  const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from("attachments").upload(path, body, { contentType: type, upsert: false });
  if (error) throw new Error(`${file.name}: ${error.message}`);
  return { path, mime: type, name: file.name, size: body.size };
}

const KNOWLEDGE_MIME = ["application/pdf", "text/plain", "text/markdown"];
const KNOWLEDGE_MAX = 10 * 1024 * 1024;

/** Uploads an agent knowledge file to the private knowledge bucket under <user>/<agent>/. */
export async function uploadKnowledgeFile(file: File, agentId: string) {
  const mime = file.type || (file.name.endsWith(".md") ? "text/markdown" : file.name.endsWith(".txt") ? "text/plain" : "");
  if (!KNOWLEDGE_MIME.includes(mime)) throw new Error(`${file.name}: use a PDF, .txt or .md file.`);
  if (file.size > KNOWLEDGE_MAX) throw new Error(`${file.name} is over 10 MB.`);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to upload files.");

  const path = `${user.id}/${agentId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_").slice(-60)}`;
  const { error } = await supabase.storage.from("knowledge").upload(path, file, { contentType: mime });
  if (error) throw new Error(`${file.name}: ${error.message}`);
  return { path, name: file.name, mime };
}
