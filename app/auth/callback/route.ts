import { NextResponse, type NextRequest } from "next/server";
import { githubCookie } from "@/lib/github";
import { safeNext } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (!code) return NextResponse.redirect(`${origin}/login?error=missing_code`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error?.message ?? "auth")}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded")
    .eq("id", data.user.id)
    .single();

  const destination = profile?.onboarded
    ? next
    : `/onboarding?next=${encodeURIComponent(next)}`;
  const response = NextResponse.redirect(`${origin}${destination}`);
  // Supabase only hands out the GitHub token once, right after OAuth — keep it for repo import & PRs.
  if (data.session?.provider_token && data.user.app_metadata?.provider === "github") {
    response.cookies.set(githubCookie(data.session.provider_token));
  }
  return response;
}
