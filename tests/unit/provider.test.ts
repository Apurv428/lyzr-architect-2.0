import { afterEach, describe, expect, it, vi } from "vitest";

// provider.ts reads keys at import time, so each case re-imports with fresh env.
async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  return import("@/lib/ai/keys");
}
const none = { anthropicKey: null, openaiKey: null, preference: null } as const;

afterEach(() => vi.unstubAllEnvs());

describe("resolveProvider", () => {
  it("falls back to demo with no keys anywhere", async () => {
    const { resolveProvider } = await load({ ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "" });
    expect(resolveProvider(none)).toEqual({ provider: "demo", byok: false });
  });

  it("uses the server OpenAI key when it's the only one", async () => {
    const { resolveProvider } = await load({ ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "", OPENAI_API_KEY: "sk-server" });
    expect(resolveProvider(none)).toEqual({ provider: "openai", byok: false });
  });

  it("prefers the user's own key and marks it credit-free", async () => {
    const { resolveProvider } = await load({ ANTHROPIC_API_KEY: "sk-ant-server", OPENAI_API_KEY: "" });
    expect(resolveProvider({ ...none, openaiKey: "sk-mine", preference: "openai" })).toEqual({ provider: "openai", apiKey: "sk-mine", byok: true });
  });

  it("honours an explicit model request over preference", async () => {
    const { resolveProvider } = await load({ ANTHROPIC_API_KEY: "sk-ant-server", OPENAI_API_KEY: "sk-server" });
    expect(resolveProvider({ ...none, preference: "anthropic" }, "openai").provider).toBe("openai");
  });

  it("falls through when the requested provider has no key", async () => {
    const { resolveProvider } = await load({ ANTHROPIC_API_KEY: "sk-ant-server", OPENAI_API_KEY: "" });
    expect(resolveProvider(none, "openai")).toEqual({ provider: "anthropic", byok: false });
  });
});
