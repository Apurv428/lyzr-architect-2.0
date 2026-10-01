"use server";

import { after } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { embedPassages } from "@/lib/agent/embed";
import { chunkDocs } from "@/lib/agent/retrieval";
import { getUser } from "@/lib/supabase/server";

export type KnowledgeDoc = { id: string; node_id: string; name: string; pages: number; chars: number; created_at: string };

const MAX_CHARS = 400_000;
const COLUMNS = "id, node_id, name, pages, chars, created_at";

/** Splits plain text into ~3,000-character "pages" so citations stay useful. */
function paginate(text: string) {
  const pages: string[] = [];
  for (let i = 0; i < text.length; i += 3000) pages.push(text.slice(i, i + 3000));
  return pages.length ? pages : [""];
}

export async function ingestKnowledgeFile(agentId: string, nodeId: string, file: { path: string; name: string; mime: string }) {
  const { supabase, user } = await getUser();
  if (!file.path.startsWith(`${user!.id}/${agentId}/`)) return { error: "Invalid file location." };

  const { data: blob, error: downloadError } = await supabase.storage.from("knowledge").download(file.path);
  if (downloadError || !blob) return { error: "Couldn't read the uploaded file." };

  let pages: string[];
  try {
    if (file.mime === "application/pdf") {
      const pdf = await getDocumentProxy(new Uint8Array(await blob.arrayBuffer()));
      pages = (await extractText(pdf, { mergePages: false })).text;
    } else {
      pages = paginate(await blob.text());
    }
  } catch {
    return { error: `${file.name} couldn't be read — is it a valid, unencrypted PDF?` };
  }

  pages = pages.map((p) => p.replace(/\u0000/g, "").trim());
  let chars = pages.reduce((n, p) => n + p.length, 0);
  if (chars === 0) {
    await supabase.storage.from("knowledge").remove([file.path]);
    return { error: `${file.name} has no selectable text — scanned PDFs need OCR first.` };
  }
  if (chars > MAX_CHARS) {
    let budget = MAX_CHARS;
    pages = pages.map((p) => {
      const kept = p.slice(0, Math.max(0, budget));
      budget -= kept.length;
      return kept;
    });
    chars = MAX_CHARS;
  }

  const { data, error } = await supabase
    .from("knowledge_docs")
    .insert({ agent_id: agentId, node_id: nodeId, name: file.name, mime: file.mime, storage_path: file.path, pages: pages.length, chars, content: pages })
    .select(COLUMNS)
    .single();
  if (error || !data) return { error: error?.message ?? "Couldn't save the document." };

  // Embed passages in the background — failures are silent so the upload always succeeds.
  // Embedding can take a while; after() keeps the function alive once the response is sent.
  after(() => embedAndStore(data.id, agentId, pages).catch(() => {}));

  return { doc: data as KnowledgeDoc, truncated: chars === MAX_CHARS };
}

export async function listKnowledgeDocs(agentId: string) {
  const { supabase } = await getUser();
  const { data } = await supabase.from("knowledge_docs").select(COLUMNS).eq("agent_id", agentId).order("created_at");
  return (data ?? []) as KnowledgeDoc[];
}

/** Chunk pages, embed them, and upsert into knowledge_passages. Fire-and-forget. */
async function embedAndStore(docId: string, agentId: string, pages: string[]) {
  const { supabase, user } = await getUser();
  if (!user) return;

  const passages = chunkDocs([{ name: "", pages }]);
  if (!passages.length) return;

  // One embedding model for every document and query (see lib/agent/embed.ts).
  const embedded = await embedPassages(passages.map((p) => p.text));

  const rows = embedded
    .map((e, i) => ({
      doc_id: docId,
      page: passages[i].page,
      chunk_idx: i,
      text: passages[i].text,
      embedding: e.embedding,
    }))
    .filter((r) => r.embedding !== null);

  if (rows.length) {
    await supabase.from("knowledge_passages").insert(rows);
  }
}

export async function removeKnowledgeDoc(id: string) {
  const { supabase } = await getUser();
  const { data: doc } = await supabase.from("knowledge_docs").select("storage_path").eq("id", id).single();
  const { error } = await supabase.from("knowledge_docs").delete().eq("id", id);
  if (error) return { error: error.message };
  if (doc?.storage_path) await supabase.storage.from("knowledge").remove([doc.storage_path]);
  return { ok: true };
}
