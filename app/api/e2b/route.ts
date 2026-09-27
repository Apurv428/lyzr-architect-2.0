import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /api/e2b  — create an E2B sandbox and return its ID + tunnel URL.
// The client polls /api/e2b?sandboxId=<id> (GET) to retrieve the URL once ready.

const E2B_API = "https://api.e2b.dev";

async function e2bFetch(path: string, options?: RequestInit) {
  const key = process.env.E2B_API_KEY;
  if (!key) throw new Error("E2B_API_KEY not configured");
  return fetch(`${E2B_API}${path}`, {
    ...options,
    headers: { "X-API-Key": key, "Content-Type": "application/json", ...options?.headers },
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, template = "base" } = (await req.json()) as { projectId?: string; template?: string };
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const res = await e2bFetch("/sandboxes", {
    method: "POST",
    body: JSON.stringify({ templateID: template, timeout: 300 }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `E2B error: ${err}` }, { status: res.status });
  }

  const { sandboxID, clientID } = (await res.json()) as { sandboxID: string; clientID: string };
  const sandboxId = `${sandboxID}-${clientID}`;

  await supabase.from("e2b_sessions").insert({ project_id: projectId, user_id: user.id, sandbox_id: sandboxId });

  const tunnelUrl = `https://${sandboxId}.e2b.app`;
  return NextResponse.json({ sandboxId, url: tunnelUrl });
}

export async function DELETE(req: NextRequest) {
  const { sandboxId } = (await req.json()) as { sandboxId?: string };
  if (!sandboxId) return NextResponse.json({ error: "sandboxId required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only allow closing own sessions.
  const { data: session } = await supabase
    .from("e2b_sessions")
    .select("id")
    .eq("sandbox_id", sandboxId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [sandboxID, clientID] = sandboxId.split("-");
  await e2bFetch(`/sandboxes/${sandboxID}/${clientID}`, { method: "DELETE" });

  await supabase
    .from("e2b_sessions")
    .update({ closed_at: new Date().toISOString() })
    .eq("sandbox_id", sandboxId);

  return NextResponse.json({ ok: true });
}
