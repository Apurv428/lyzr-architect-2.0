import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/oauth/[provider]/status">) {
  const { provider } = await ctx.params;
  const projectId = req.nextUrl.searchParams.get("projectId");

  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ connected: false });

  const { data } = await supabase
    .from("oauth_connectors")
    .select("id")
    .eq("provider", provider)
    .eq("project_id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();

  return NextResponse.json({ connected: !!data });
}
