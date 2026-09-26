import "server-only";

export type GmailSendResult = { ok: true; messageId: string } | { ok: false; error: string };

/** Send an email using the Gmail REST API. */
export async function sendGmail(
  accessToken: string,
  to: string,
  subject: string,
  body: string,
): Promise<GmailSendResult> {
  // Gmail API expects a base64url-encoded RFC 2822 message.
  const message = [`To: ${to}`, `Subject: ${subject}`, "Content-Type: text/plain; charset=utf-8", "", body].join("\r\n");
  const encoded = Buffer.from(message).toString("base64url");

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ raw: encoded }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return { ok: false, error: err.error?.message ?? `HTTP ${res.status}` };
  }

  const json = (await res.json()) as { id?: string };
  return { ok: true, messageId: json.id ?? "" };
}
