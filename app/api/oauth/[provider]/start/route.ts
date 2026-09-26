import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// OAuth authorization URL builders for each provider.
const AUTH_URLS: Record<string, (clientId: string, redirectUri: string, state: string) => string> = {
  slack: (id, uri, state) =>
    `https://slack.com/oauth/v2/authorize?client_id=${id}&scope=chat:write,channels:read&redirect_uri=${encodeURIComponent(uri)}&state=${state}`,
  gmail: (id, uri, state) =>
    `https://accounts.google.com/o/oauth2/v2/auth?client_id=${id}&redirect_uri=${encodeURIComponent(uri)}&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.send&access_type=offline&prompt=consent&state=${state}`,
  hubspot: (id, uri, state) =>
    `https://app.hubspot.com/oauth/authorize?client_id=${id}&redirect_uri=${encodeURIComponent(uri)}&scope=crm.objects.contacts.write&state=${state}`,
};

export async function GET(req: NextRequest, ctx: RouteContext<"/api/oauth/[provider]/start">) {
  const { provider } = await ctx.params;
  const projectId = req.nextUrl.searchParams.get("projectId");

  if (!AUTH_URLS[provider]) return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
  if (!clientId) return NextResponse.json({ error: `${provider} OAuth not configured` }, { status: 503 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  const redirectUri = `${appUrl}/api/oauth/${provider}/callback`;

  // Encode project + user in state (signed by the session — not a secret, just correlation).
  const state = Buffer.from(JSON.stringify({ projectId, userId: user.id })).toString("base64url");
  const authUrl = AUTH_URLS[provider](clientId, redirectUri, state);

  return NextResponse.redirect(authUrl);
}
