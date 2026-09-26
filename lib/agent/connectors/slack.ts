import "server-only";

export type SlackPostResult = { ok: true; ts: string } | { ok: false; error: string };

/** Post a message using the Slack Web API (Bot token). */
export async function postSlackMessage(
  accessToken: string,
  channel: string,
  text: string,
): Promise<SlackPostResult> {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ channel, text }),
  });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  const json = (await res.json()) as { ok: boolean; ts?: string; error?: string };
  return json.ok ? { ok: true, ts: json.ts ?? "" } : { ok: false, error: json.error ?? "slack_error" };
}
