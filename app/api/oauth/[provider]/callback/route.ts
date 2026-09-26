import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { saveConnector, type OAuthProvider } from "@/lib/agent/connectors";

const TOKEN_URLS: Record<string, string> = {
  slack: "https://slack.com/api/oauth.v2.access",
  gmail: "https://oauth2.googleapis.com/token",
  hubspot: "https://api.hubapi.com/oauth/v1/token",
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  ok?: boolean; // Slack
  authed_user?: { access_token?: string }; // Slack v2
  team?: { name?: string }; // Slack
  error?: string;
};

async function exchangeCode(
  provider: string,
  code: string,
  redirectUri: string,
): Promise<TokenResponse | null> {
  const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`]!;
  const clientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`]!;

  const params = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  // Slack uses a different token exchange mechanism.
  const headers: Record<string, string> = provider === "slack"
    ? { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }
    : { "Content-Type": "application/x-www-form-urlencoded" };

  const res = await fetch(TOKEN_URLS[provider], { method: "POST", headers, body: params });
  if (!res.ok) return null;
  return res.json() as Promise<TokenResponse>;
}

export async function GET(req: NextRequest, ctx: RouteContext<"/api/oauth/[provider]/callback">) {
  const { provider } = await ctx.params;
  const code = req.nextUrl.searchParams.get("code");
  const stateRaw = req.nextUrl.searchParams.get("state");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;

  if (!code || !stateRaw) return NextResponse.redirect(`${appUrl}?oauth=error&reason=missing_code`);
  if (!TOKEN_URLS[provider]) return NextResponse.redirect(`${appUrl}?oauth=error&reason=unknown_provider`);

  let projectId: string;
  try {
    const decoded = JSON.parse(Buffer.from(stateRaw, "base64url").toString()) as { projectId: string };
    projectId = decoded.projectId;
  } catch {
    return NextResponse.redirect(`${appUrl}?oauth=error&reason=bad_state`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${appUrl}/login`);

  const redirectUri = `${appUrl}/api/oauth/${provider}/callback`;
  const tokens = await exchangeCode(provider, code, redirectUri);
  if (!tokens) return NextResponse.redirect(`${appUrl}/p/${projectId}?oauth=error&reason=token_exchange`);

  // Normalise across providers.
  let accessToken: string | undefined;
  let refreshToken: string | undefined;
  let expiresAt: string | null = null;
  const meta: Record<string, string> = {};

  if (provider === "slack") {
    if (!tokens.ok) return NextResponse.redirect(`${appUrl}/p/${projectId}?oauth=error&reason=${tokens.error}`);
    accessToken = tokens.access_token;
    if (tokens.team?.name) meta["team_name"] = tokens.team.name;
  } else {
    accessToken = tokens.access_token;
    refreshToken = tokens.refresh_token;
    if (tokens.expires_in) expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  }

  if (!accessToken) return NextResponse.redirect(`${appUrl}/p/${projectId}?oauth=error&reason=no_token`);

  await saveConnector(supabase, user.id, projectId, provider as OAuthProvider, { accessToken, refreshToken, expiresAt }, meta);

  // Close the popup and notify the parent window.
  return new NextResponse(
    `<script>window.opener?.postMessage({type:"oauth_success",provider:"${provider}"},location.origin);window.close();</script>`,
    { headers: { "Content-Type": "text/html" } },
  );
}
