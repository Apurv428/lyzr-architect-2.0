import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MAX_INPUT_CHARS,
  TOKEN_PATTERN,
  checkForwardUrl,
  generateWebhookSecrets,
  hashWebhookToken,
  isPrivateAddress,
  signWebhookBody,
  webhookInput,
} from "@/lib/webhooks";

describe("webhook secrets", () => {
  it("issues URL-safe tokens that only the hash identifies", () => {
    const { token, hash, signingSecret } = generateWebhookSecrets();
    expect(token).toMatch(TOKEN_PATTERN);
    expect(hash).toBe(hashWebhookToken(token));
    expect(hash).not.toContain(token);
    expect(signingSecret).toMatch(/^whsec_[A-Za-z0-9_-]{32}$/);
    expect(generateWebhookSecrets().token).not.toBe(token);
  });
});

describe("webhookInput", () => {
  it("uses a chat-style field as the input", () => {
    expect(webhookInput({ message: "  Where is order #8812?  " })).toBe("Where is order #8812?");
    expect(webhookInput({ input: "hi", message: "ignored" })).toBe("hi");
    expect(webhookInput("plain text body")).toBe("plain text body");
  });

  it("passes any other payload to the agent as JSON", () => {
    const text = webhookInput({ type: "invoice.paid", data: { amount: 4200 } });
    expect(text.startsWith("A webhook delivered this payload:")).toBe(true);
    expect(text).toContain('"invoice.paid"');
    expect(webhookInput({ message: "" })).toContain('"message": ""');
  });

  it("keeps huge payloads within the input limit", () => {
    const text = webhookInput({ blob: "x".repeat(20_000) });
    expect(text.length).toBeLessThanOrEqual(MAX_INPUT_CHARS);
    expect(text).toContain("(truncated)");
    expect(webhookInput("y".repeat(20_000))).toHaveLength(MAX_INPUT_CHARS);
  });
});

describe("isPrivateAddress", () => {
  it.each(["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.168.1.1", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "not-an-ip"])(
    "blocks %s",
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(["8.8.8.8", "172.32.0.1", "1.1.1.1", "2606:4700:4700::1111"])("allows %s", (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe("checkForwardUrl", () => {
  it("accepts public https URLs", () => {
    const res = checkForwardUrl("https://hooks.example.com/architect?source=1");
    expect(res.ok).toBe(true);
  });

  it.each([
    ["http://hooks.example.com/x", "https"],
    ["https://localhost/x", "public host"],
    ["https://printer.local/x", "public host"],
    ["https://intranet/x", "public host"],
    ["https://10.0.0.5/x", "private"],
    ["https://[::1]/x", "private"],
    ["https://user:pass@hooks.example.com/x", "username"],
    ["https://hooks.example.com:8443/x", "port"],
    ["not a url", "valid URL"],
  ])("rejects %s", (url, reason) => {
    const res = checkForwardUrl(url);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain(reason);
  });
});

describe("signWebhookBody", () => {
  it("signs timestamp and body with HMAC-SHA256", () => {
    const body = JSON.stringify({ event: "agent.run.completed", output: "Shipped yesterday." });
    const expected = createHmac("sha256", "whsec_test").update(`1727600000.${body}`).digest("hex");
    expect(signWebhookBody("whsec_test", body, 1727600000)).toBe(`t=1727600000,v1=${expected}`);
    expect(signWebhookBody("whsec_other", body, 1727600000)).not.toBe(`t=1727600000,v1=${expected}`);
  });
});
