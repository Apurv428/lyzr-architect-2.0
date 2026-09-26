import "server-only";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { ResolvedProvider } from "@/lib/ai/keys";

const OPENAI_EMBED_MODEL = "text-embedding-3-small";
const VOYAGE_EMBED_MODEL = "voyage-3";
const EMBED_DIM = 1536;
const BATCH_SIZE = 96;

export type EmbeddedPassage = { text: string; embedding: number[] };

/** Embed a single string. Returns null when the provider can't embed (demo mode). */
export async function embedText(text: string, provider: ResolvedProvider): Promise<number[] | null> {
  if (provider.provider === "demo") return null;

  if (provider.provider === "openai") {
    const client = new OpenAI({ apiKey: provider.apiKey });
    const res = await client.embeddings.create({ model: OPENAI_EMBED_MODEL, input: text, dimensions: EMBED_DIM });
    return res.data[0].embedding;
  }

  // Anthropic doesn't expose an embeddings API directly; use Voyage via their compatibility layer.
  // voyageai SDK isn't bundled, so we call the REST endpoint with the Anthropic key.
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({ model: VOYAGE_EMBED_MODEL, input: [text] }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  const raw = json.data[0]?.embedding ?? [];
  // Pad or truncate to EMBED_DIM so the vector column never rejects it.
  const out = new Array<number>(EMBED_DIM).fill(0);
  for (let i = 0; i < Math.min(raw.length, EMBED_DIM); i++) out[i] = raw[i];
  return out;
}

/** Embed an array of passage texts in batches. Passages that fail are returned with null embedding. */
export async function embedPassages(
  texts: string[],
  provider: ResolvedProvider,
): Promise<Array<{ text: string; embedding: number[] | null }>> {
  if (provider.provider === "demo" || !texts.length) {
    return texts.map((text) => ({ text, embedding: null }));
  }

  const results: Array<{ text: string; embedding: number[] | null }> = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    if (provider.provider === "openai") {
      try {
        const client = new OpenAI({ apiKey: provider.apiKey });
        const res = await client.embeddings.create({ model: OPENAI_EMBED_MODEL, input: batch, dimensions: EMBED_DIM });
        for (let j = 0; j < batch.length; j++) {
          results.push({ text: batch[j], embedding: res.data[j]?.embedding ?? null });
        }
      } catch {
        batch.forEach((text) => results.push({ text, embedding: null }));
      }
    } else {
      // Voyage: one HTTP call per batch
      try {
        const res = await fetch("https://api.voyageai.com/v1/embeddings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify({ model: VOYAGE_EMBED_MODEL, input: batch }),
        });
        if (!res.ok) throw new Error(`Voyage ${res.status}`);
        const json = (await res.json()) as { data: { embedding: number[] }[] };
        for (let j = 0; j < batch.length; j++) {
          const raw = json.data[j]?.embedding ?? [];
          const out = new Array<number>(EMBED_DIM).fill(0);
          for (let k = 0; k < Math.min(raw.length, EMBED_DIM); k++) out[k] = raw[k];
          results.push({ text: batch[j], embedding: out });
        }
      } catch {
        batch.forEach((text) => results.push({ text, embedding: null }));
      }
    }
  }

  return results;
}
