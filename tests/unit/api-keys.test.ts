import { describe, expect, it } from "vitest";
import { KEY_PREFIX, generateApiKey, hashApiKey, parseBearer } from "@/lib/api-keys";

describe("agent API keys", () => {
  it("generates unique, well-formed keys and stores only a hash", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).toMatch(/^arc_live_[A-Za-z0-9_-]{43}$/);
    expect(a.key).not.toBe(b.key);
    expect(a.prefix).toBe(a.key.slice(0, KEY_PREFIX.length + 4));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).toBe(hashApiKey(a.key));
    expect(a.hash).not.toContain(a.key.slice(KEY_PREFIX.length));
  });

  it("accepts only well-formed bearer keys", () => {
    const { key } = generateApiKey();
    expect(parseBearer(`Bearer ${key}`)).toBe(key);
    expect(parseBearer(`bearer ${key}  `)).toBe(key);
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer(key)).toBeNull();
    expect(parseBearer("Bearer arc_live_short")).toBeNull();
    expect(parseBearer(`Bearer ${key}x`)).toBeNull();
    expect(parseBearer(`Bearer ${key} extra`)).toBeNull();
    expect(parseBearer(`Basic ${key}`)).toBeNull();
  });
});
