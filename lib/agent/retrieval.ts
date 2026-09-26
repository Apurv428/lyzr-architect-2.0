// Lightweight retrieval: split documents into page-aware passages and rank them with BM25.
// Good enough for policies, FAQs and handbooks without an embeddings pipeline.

export type SourceDoc = { name: string; pages: string[] };
export type Passage = { doc: string; page: number; text: string };
export type RankedPassage = Passage & { score: number };

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

export function rank(passages: Passage[], query: string, k = 6): RankedPassage[] {
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

/** "Returns-Policy.pdf (p. 3, 4) · FAQ.md (p. 1)" */
export function describeSources(passages: Passage[]) {
  const byDoc = new Map<string, Set<number>>();
  for (const p of passages) byDoc.set(p.doc, (byDoc.get(p.doc) ?? new Set()).add(p.page));
  return [...byDoc].map(([doc, pages]) => `${doc} (p. ${[...pages].sort((a, b) => a - b).join(", ")})`).join(" · ");
}
