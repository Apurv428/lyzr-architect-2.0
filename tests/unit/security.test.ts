import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/lib/crypto";
import { safeNext } from "@/lib/safe-redirect";

describe("safeNext", () => {
  it("keeps same-origin paths", () => {
    expect(safeNext("/p/123?tab=code")).toBe("/p/123?tab=code");
  });
  it.each(["//evil.com", "/\\evil.com", "https://evil.com", "evil.com", "/\u0000x", "", null, 42])("rejects %j", (v) => {
    expect(safeNext(v)).toBe("/dashboard");
  });
});

describe("encrypt / decrypt", () => {
  it("round-trips", () => {
    const token = "ghp_" + "a".repeat(36);
    const sealed = encrypt(token);
    expect(sealed).not.toContain(token);
    expect(decrypt(sealed)).toBe(token);
  });
  it("uses a fresh IV every time", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });
  it("rejects tampered or malformed input", () => {
    const [v, iv, tag, data] = encrypt("secret").split(":");
    const flipped = data.slice(0, -2) + (data.at(-2) === "A" ? "B" : "A") + data.at(-1);
    expect(decrypt([v, iv, tag, flipped].join(":"))).toBeNull();
    expect(decrypt("ghp_plaintext_cookie")).toBeNull();
    expect(decrypt(undefined)).toBeNull();
  });
});
