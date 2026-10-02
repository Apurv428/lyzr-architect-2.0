import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeToolCall } from "@/lib/agent/run";

const VALID_WEBHOOK = "https://hooks.slack.com/services/T000/B000/xxxxxxxxxxxxxxxxxxxxxxxxxxxx";

describe("executeToolCall — slack_message", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to Slack and returns live=true when webhook URL is valid", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    const result = await executeToolCall("slack_message", { channel: "#eng", text: "Hello team" }, { slackWebhookUrl: VALID_WEBHOOK });

    expect(result.live).toBe(true);
    expect(JSON.parse(result.output)).toMatchObject({ ok: true, channel: "#eng" });
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(VALID_WEBHOOK);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ text: "Hello team" });
  });

  it("simulates when no webhook URL is provided", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const result = await executeToolCall("slack_message", { channel: "#eng", text: "Hi" });

    expect(result.live).toBe(false);
    expect(JSON.parse(result.output)).toMatchObject({ ok: true, channel: "#eng" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("simulates when webhook URL fails the allowlist pattern (SSRF guard)", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const badUrls = [
      "https://evil.com/services/T000/B000/xxx",
      "http://hooks.slack.com/services/T000/B000/xxx",
      "https://hooks.slack.com.evil.com/services/T000/B000/xxx",
      "",
    ];
    for (const url of badUrls) {
      const result = await executeToolCall("slack_message", { channel: "#eng", text: "Hi" }, { slackWebhookUrl: url });
      expect(result.live).toBe(false);
    }
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("reports a failure, not a simulated success, when Slack can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    const result = await executeToolCall("slack_message", { channel: "#eng", text: "Hi" }, { slackWebhookUrl: VALID_WEBHOOK });

    expect(result.live).toBe(true);
    expect(JSON.parse(result.output)).toMatchObject({ ok: false, error: expect.stringMatching(/reach Slack/) });
  });

  it("reports Slack's reason when it rejects the saved webhook", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => "no_team" }));

    const result = await executeToolCall("slack_message", { channel: "#eng", text: "Hi" }, { slackWebhookUrl: VALID_WEBHOOK });

    expect(result.live).toBe(true);
    expect(JSON.parse(result.output)).toMatchObject({ ok: false, error: expect.stringMatching(/404: no_team/) });
  });

  it("does not call fetch for non-Slack tools even with a webhook URL", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const result = await executeToolCall("send_email", { to: "a@b.co", subject: "Hi", body: "Hello" }, { slackWebhookUrl: VALID_WEBHOOK });

    expect(result.live).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
