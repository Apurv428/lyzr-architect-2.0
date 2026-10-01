import "server-only";
import type { ResolvedProvider } from "@/lib/ai/keys";
import { openaiClient } from "@/lib/ai/provider";

// Passages and queries must share one vector space, so everything is embedded with the same model:
// the platform's OpenAI-compatible endpoint (OPENAI_BASE_URL may point at Gemini, which has a
// 1536-dimension embedding model too). Whichever model the agent itself runs on doesn't matter here.
// Without a platform key, search falls back to keyword ranking (BM25).

const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small";
const EMBED_DIM = 1536;
const BATCH_SIZE = 96;

export type EmbeddedPassage = { text: string; embedding: number[] };

const embeddingsAvailable = () => Boolean(process.env.OPENAI_API_KEY);

/** Embed a single string. Returns null when no embedding endpoint is configured or the call fails. */
export async function embedText(text: string, provider?: ResolvedProvider): Promise<number[] | null> {
  if (provider?.provider === "demo" && !embeddingsAvailable()) return null;
  if (!embeddingsAvailable()) return null;
  const res = await openaiClient().embeddings.create({ model: EMBED_MODEL, input: text, dimensions: EMBED_DIM });
  return res.data[0]?.embedding ?? null;
}

/** Embed passage texts in batches. Passages that fail come back with a null embedding. */
export async function embedPassages(texts: string[], provider?: ResolvedProvider): Promise<Array<{ text: string; embedding: number[] | null }>> {
  if (!texts.length || !embeddingsAvailable() || (provider?.provider === "demo" && !embeddingsAvailable())) {
    return texts.map((text) => ({ text, embedding: null }));
  }
  const client = openaiClient();
  const results: Array<{ text: string; embedding: number[] | null }> = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    try {
      const res = await client.embeddings.create({ model: EMBED_MODEL, input: batch, dimensions: EMBED_DIM });
      batch.forEach((text, j) => results.push({ text, embedding: res.data[j]?.embedding ?? null }));
    } catch {
      batch.forEach((text) => results.push({ text, embedding: null }));
    }
  }
  return results;
}
