// Retrieval: BM25 over passage chunks, with optional hybrid pgvector search.
// When a Supabase client + embedding are provided, vector results are RRF-fused with BM25.

import type { SupabaseClient } from "@supabase/supabase-js";

export type SourceDoc = { name: string; pages: string[] };
export type Passage = { doc: string; page: number; text: string };
export type RankedPassage = Passage & { score: number };

export type HybridOptions = {
  supabase: SupabaseClient;
  agentId: string;
  nodeId: string;
  embedding: number[];
};

const TARGET = 900;
const OVERLAP = 150;

const STOP = new Set(
  "a an and are as at be but by can do does for from how i if in into is it its me my of on or our so than that the their them then there these they this to up us was we what when where which who why will with you your".split(" "),
);

/** Tiny suffix stemmer so "refunds", "refunded" and "refunding" all match "refund". */
function stem(word: string) {
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 4 && /(s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function tokenize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem);
}

/** ~900-character passages that never cross a page boundary, with a small overlap for context. */
export function chunkDocs(docs: SourceDoc[]): Passage[] {
  const out: Passage[] = [];
  for (const doc of docs) {
    doc.pages.forEach((raw, i) => {
      const text = raw.replace(/\s+/g, " ").trim();
      if (!text) return;
      for (let start = 0; start < text.length; start += TARGET - OVERLAP) {
        let end = Math.min(text.length, start + TARGET);
        // Prefer to end on a sentence boundary.
        const stop = text.lastIndexOf(". ", end);
        if (end < text.length && stop > start + TARGET / 2) end = stop + 1;
        out.push({ doc: doc.name, page: i + 1, text: text.slice(start, end).trim() });
        if (end >= text.length) break;
        start = end - (TARGET - OVERLAP);
      }
    });
  }
  return out;
}

export function bm25(passages: Passage[], query: string, k = 6): RankedPassage[] {
  const q = [...new Set(tokenize(query))];
  if (!q.length || !passages.length) return [];
  const docs = passages.map((p) => tokenize(p.text));
  const avg = docs.reduce((n, d) => n + d.length, 0) / docs.length || 1;
  const df = new Map(q.map((t) => [t, docs.filter((d) => d.includes(t)).length]));
  const N = docs.length;
  const k1 = 1.2;
  const b = 0.75;

  return passages
    .map((p, i) => {
      const d = docs[i];
      let score = 0;
      for (const t of q) {
        const tf = d.filter((x) => x === t).length;
        if (!tf) continue;
        const idf = Math.log(1 + (N - df.get(t)! + 0.5) / (df.get(t)! + 0.5));
        score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * d.length) / avg)));
      }
      return { ...p, score };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/**
 * Hybrid BM25 + vector search with Reciprocal Rank Fusion.
 * Falls back to BM25-only when no hybrid options are provided (e.g. in tests).
 */
export async function rank(
  passages: Passage[],
  query: string,
  k = 6,
  hybrid?: HybridOptions,
): Promise<RankedPassage[]> {
  const bm25Results = bm25(passages, query, k * 2);

  if (!hybrid) return bm25Results.slice(0, k);

  // Fetch vector results from Postgres.
  type VecRow = { doc_name: string; page: number; text: string; score: number };
  const { data: vecRows } = await hybrid.supabase.rpc("knowledge_search", {
    p_agent_id: hybrid.agentId,
    p_node_id: hybrid.nodeId,
    p_embedding: hybrid.embedding,
    p_limit: k * 2,
  });
  const vecResults: RankedPassage[] = ((vecRows ?? []) as VecRow[]).map((r) => ({
    doc: r.doc_name,
    page: r.page,
    text: r.text,
    score: r.score,
  }));

  if (!vecResults.length) return bm25Results.slice(0, k);

  // Reciprocal Rank Fusion: score = Σ 1/(60 + rank).
  const RRF_K = 60;
  const scores = new Map<string, { passage: Passage; score: number }>();

  function key(p: Passage) {
    return `${p.doc}::${p.page}::${p.text.slice(0, 40)}`;
  }

  bm25Results.forEach((p, rank) => {
    const k2 = key(p);
    scores.set(k2, { passage: p, score: (scores.get(k2)?.score ?? 0) + 1 / (RRF_K + rank) });
  });
  vecResults.forEach((p, rank) => {
    const k2 = key(p);
    scores.set(k2, { passage: p, score: (scores.get(k2)?.score ?? 0) + 1 / (RRF_K + rank) });
  });

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ passage, score }) => ({ ...passage, score }));
}

/** "Returns-Policy.pdf (p. 3, 4) · FAQ.md (p. 1)" */
export function describeSources(passages: Passage[]) {
  const byDoc = new Map<string, Set<number>>();
  for (const p of passages) byDoc.set(p.doc, (byDoc.get(p.doc) ?? new Set()).add(p.page));
  return [...byDoc].map(([doc, pages]) => `${doc} (p. ${[...pages].sort((a, b) => a - b).join(", ")})`).join(" · ");
}
