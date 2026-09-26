import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/crypto";

export type OAuthProvider = "slack" | "gmail" | "hubspot";

export type ConnectorConfig = {
  accessToken: string;
  meta: Record<string, string>;
};

/** Load and decrypt a connector's access token for a project. Returns null if not connected. */
export async function resolveConnector(
  provider: OAuthProvider,
  projectId: string,
  supabase: SupabaseClient,
): Promise<ConnectorConfig | null> {
  const { data } = await supabase
    .from("oauth_connectors")
    .select("access_token, meta, expires_at, refresh_token")
    .eq("provider", provider)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!data) return null;

  let accessToken = decrypt(data.access_token);
  if (!accessToken) return null;

  // If token is expired and we have a refresh token, try to refresh (provider-specific).
  if (data.expires_at && new Date(data.expires_at) < new Date() && data.refresh_token) {
    const refreshed = await refreshToken(provider, decrypt(data.refresh_token) ?? "");
    if (refreshed) {
      accessToken = refreshed.accessToken;
      // Persist the new token.
      await supabase
        .from("oauth_connectors")
        .update({
          access_token: encrypt(refreshed.accessToken),
          expires_at: refreshed.expiresAt,
          ...(refreshed.refreshToken ? { refresh_token: encrypt(refreshed.refreshToken) } : {}),
        })
        .eq("provider", provider)
        .eq("project_id", projectId);
    }
  }

  return { accessToken, meta: (data.meta as Record<string, string>) ?? {} };
}

async function refreshToken(
  provider: OAuthProvider,
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: string | null; refreshToken?: string } | null> {
  const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
  const clientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`];
  if (!clientId || !clientSecret || !refreshToken) return null;

  // Google/Gmail token endpoint.
  if (provider === "gmail") {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;
    const expiresAt = json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : null;
    return { accessToken: json.access_token, expiresAt };
  }

  return null;
}

/** Persist a new connector after OAuth callback. */
export async function saveConnector(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  provider: OAuthProvider,
  tokens: { accessToken: string; refreshToken?: string; expiresAt?: string | null },
  meta?: Record<string, string>,
) {
  await supabase.from("oauth_connectors").upsert(
    {
      owner_id: userId,
      project_id: projectId,
      provider,
      access_token: encrypt(tokens.accessToken),
      refresh_token: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
      expires_at: tokens.expiresAt ?? null,
      meta: meta ?? {},
    },
    { onConflict: "owner_id,project_id,provider" },
  );
}
