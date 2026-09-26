import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/ai/schema";
import { activeAttachments } from "@/lib/attachments";

const file = { path: "u/1-shot.png", mime: "image/png", name: "shot.png", size: 1 };
const msg = (role: ChatMessage["role"], kind: ChatMessage["kind"], data: ChatMessage["data"] = null): ChatMessage => ({
  id: Math.random().toString(36),
  role,
  kind,
  content: "x",
  data,
  created_at: "",
});

describe("activeAttachments", () => {
  it("carries a screenshot from the idea through plan approval", () => {
    const history = [msg("user", "text", { attachments: [file] }), msg("assistant", "plan"), msg("user", "text", { approved: true })];
    expect(activeAttachments(history)).toEqual([file]);
  });
  it("drops it once a build has used it", () => {
    const history = [msg("user", "text", { attachments: [file] }), msg("assistant", "plan"), msg("assistant", "changes"), msg("user", "text")];
    expect(activeAttachments(history)).toBeUndefined();
  });
  it("picks up files attached after a build", () => {
    const history = [msg("assistant", "changes"), msg("user", "text", { attachments: [file] })];
    expect(activeAttachments(history)).toEqual([file]);
  });
});
