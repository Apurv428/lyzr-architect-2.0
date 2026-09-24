import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES-256-GCM with a key derived from ARCHITECT_SECRET. Output: "v1:<iv>:<tag>:<ciphertext>" (base64url).
const DEV_FALLBACK = "architect-dev-only-secret-do-not-use-in-production";

function key() {
  const secret = process.env.ARCHITECT_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ARCHITECT_SECRET must be set (32+ characters) to store secrets.");
    }
    return createHash("sha256").update(DEV_FALLBACK).digest();
  }
  return createHash("sha256").update(secret).digest();
}

export function encrypt(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(":");
}

/** Returns null for anything tampered with, malformed or encrypted under another key. */
export function decrypt(payload: string | undefined | null) {
  if (!payload) return null;
  const [version, iv, tag, data] = payload.split(":");
  if (version !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
