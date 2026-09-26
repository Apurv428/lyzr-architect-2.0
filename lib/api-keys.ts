import "server-only";
import { createHash, randomBytes } from "node:crypto";

// Agent API keys look like `arc_live_<32 random bytes, base64url>`. Only the SHA-256 hash is stored;
// the full key is shown to the owner once, and the prefix is kept to recognise it in a list.
export const KEY_PREFIX = "arc_live_";
const KEY_PATTERN = /^arc_live_[A-Za-z0-9_-]{43}$/;

export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey() {
  const key = KEY_PREFIX + randomBytes(32).toString("base64url");
  return { key, prefix: key.slice(0, KEY_PREFIX.length + 4), hash: hashApiKey(key) };
}

/** Pulls a well-formed key out of an `Authorization: Bearer …` header, or returns null. */
export function parseBearer(header: string | null) {
  const match = header?.match(/^Bearer\s+(\S+)\s*$/i);
  return match && KEY_PATTERN.test(match[1]) ? match[1] : null;
}
