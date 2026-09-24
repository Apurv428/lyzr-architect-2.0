/**
 * Only allow same-origin relative paths after login. Rejects protocol-relative
 * ("//evil.com"), backslash tricks ("/\evil.com" — browsers read "\" as "/"),
 * and control characters.
 */
export function safeNext(value: unknown, fallback = "/dashboard") {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}
