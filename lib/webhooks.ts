import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Webhook URLs look like `/api/hooks/whk_<32 random bytes, base64url>`. Only the SHA-256 hash is used
// for lookup; results forwarded to the owner are signed with a per-webhook `whsec_` secret.
export const TOKEN_PATTERN = /^whk_[A-Za-z0-9_-]{43}$/;
export const MAX_INPUT_CHARS = 4000;
const FORWARD_TIMEOUT_MS = 8000;

export const hashWebhookToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function generateWebhookSecrets() {
  const token = `whk_${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashWebhookToken(token), signingSecret: `whsec_${randomBytes(24).toString("base64url")}` };
}

/**
 * Turns whatever an app sent into the agent's input. A top-level `input`, `message`, `text` or `prompt`
 * string is used as-is (that's how chat-style tools send it); anything else is passed as JSON.
 */
export function webhookInput(payload: unknown): string {
  if (typeof payload === "string") return payload.trim().slice(0, MAX_INPUT_CHARS);
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    for (const key of ["input", "message", "text", "prompt"]) {
      const value = (payload as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim()) return value.trim().slice(0, MAX_INPUT_CHARS);
    }
  }
  const json = JSON.stringify(payload, null, 2) ?? "";
  const clipped = json.length > MAX_INPUT_CHARS - 40 ? `${json.slice(0, MAX_INPUT_CHARS - 60)}\n… (truncated)` : json;
  return `A webhook delivered this payload:\n${clipped}`;
}

/** Private, loopback, link-local and other non-public addresses, so forwards can't reach internal services. */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return lower === "::" || lower === "::1" || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
  }
  return true;
}

/** Checks a forward URL's shape: https on the default port, no credentials, not an internal host. */
export function checkForwardUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "That isn't a valid URL." };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "Forward URLs must use https://." };
  if (url.username || url.password) return { ok: false, reason: "Remove the username and password from the URL." };
  if (url.port && url.port !== "443") return { ok: false, reason: "Forward URLs must use the standard https port." };
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || /\.(localhost|local|internal|lan|home)$/.test(host) || !host.includes(".") && !isIP(host)) {
    return { ok: false, reason: "Forward URLs must point at a public host." };
  }
  if (isIP(host) && isPrivateAddress(host)) return { ok: false, reason: "Forward URLs can't point at a private network address." };
  return { ok: true, url };
}

/** Resolves the host and refuses it if any address is private, so DNS can't route a forward inward. */
async function assertPublicHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error("Forward host resolves to a private address.");
}

/** Full check used when a forward URL is saved: shape first, then where the host actually resolves. */
export async function validateForwardUrl(raw: string): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  const checked = checkForwardUrl(raw);
  if (!checked.ok) return checked;
  try {
    await assertPublicHost(checked.url.hostname);
  } catch (err) {
    const notFound = (err as NodeJS.ErrnoException).code === "ENOTFOUND";
    return { ok: false, reason: notFound ? "Couldn't find that host — check the URL." : "Forward URLs must point at a public host." };
  }
  return { ok: true, url: checked.url.toString() };
}

/** `t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">`, so receivers can verify the sender and reject replays. */
export function signWebhookBody(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)) {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

/** POSTs a signed JSON body to the owner's URL. Returns the HTTP status, or 0 if it never got one. */
export async function forwardResult(forwardUrl: string, secret: string, event: string, payload: Record<string, unknown>) {
  const checked = checkForwardUrl(forwardUrl);
  if (!checked.ok) return 0;
  try {
    await assertPublicHost(checked.url.hostname);
    const body = JSON.stringify({ event, ...payload });
    const res = await fetch(checked.url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Architect-Webhooks/1.0",
        "X-Architect-Event": event,
        "X-Architect-Signature": signWebhookBody(secret, body),
      },
      body,
    });
    return res.status;
  } catch (err) {
    console.warn("[webhooks] forward failed:", (err as Error).message);
    return 0;
  }
}
