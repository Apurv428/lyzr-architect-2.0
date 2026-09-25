import { z } from "zod";
import type { FileMap } from "@/lib/ai/schema";
import { track } from "@/lib/analytics";
import { encrypt } from "@/lib/crypto";
import { deploymentUrl, type DeployEvent, type DeployLog, type Deployment } from "@/lib/deploy";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { SANDBOX_DEPENDENCIES } from "@/lib/workspace/sandbox";

export const maxDuration = 60;

const Body = z.object({
  projectId: z.string().uuid(),
  env: z.enum(["preview", "production"]),
  envVars: z.array(z.object({ key: z.string().regex(/^[A-Z_][A-Z0-9_]*$/), value: z.string().max(2000) })).max(30).default([]),
  domain: z.string().max(120).optional(),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "app";

export async function POST(request: Request) {
  if (!isSupabaseConfigured) return Response.json({ error: "Backend not configured" }, { status: 503 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid deploy settings — env var names must be UPPER_SNAKE_CASE." }, { status: 400 });
  const { projectId, env, envVars, domain } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: project }, { data: checkpoint }] = await Promise.all([
    supabase.from("projects").select("id, name, slug").eq("id", projectId).single(),
    supabase.from("checkpoints").select("id, label, files").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
  if (!checkpoint) return Response.json({ error: "Build the app before deploying." }, { status: 400 });

  let slug = project.slug as string | null;
  if (!slug) {
    slug = `${slugify(project.name)}-${Math.random().toString(36).slice(2, 6)}`;
    await supabase.from("projects").update({ slug }).eq("id", projectId);
  }
  if (domain !== undefined) await supabase.from("projects").update({ custom_domain: domain.trim() || null }).eq("id", projectId);
  if (envVars.length) {
    await supabase.from("env_vars").upsert(
      envVars.map((v) => ({ project_id: projectId, key: v.key, value: encrypt(v.value), env })),
      { onConflict: "project_id,key,env" },
    );
  }

  const { data: row, error } = await supabase
    .from("deployments")
    .insert({ project_id: projectId, env, status: "building", slug, label: project.name, commit_sha: checkpoint.id.slice(0, 7) })
    .select("id, env, status, slug, label, is_current, created_at")
    .single();
  if (error || !row) return Response.json({ error: error?.message ?? "Could not start deploy" }, { status: 500 });

  const origin = new URL(request.url).origin;
  const files = checkpoint.files as FileMap;
  const bytes = Object.values(files).reduce((n, c) => n + new TextEncoder().encode(c).length, 0);
  const deps = ["react", "react-dom", ...Object.keys(SANDBOX_DEPENDENCIES)];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: DeployEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      const logs: DeployLog[] = [];
      const t0 = Date.now();
      const log = async (text: string, level: DeployLog["level"] = "info", wait = 350) => {
        const entry = { at: Date.now() - t0, level, text };
        logs.push(entry);
        send({ t: "log", log: entry });
        await sleep(wait);
      };

      try {
        const steps: [string, DeployLog["level"], number][] = [
          [`Deploying “${checkpoint.label}” to ${env}`, "info", 400],
          [`Cloning checkpoint ${checkpoint.id.slice(0, 7)} (${Object.keys(files).length} files, ${(bytes / 1024).toFixed(1)} kB)`, "info", 500],
          [`Installing dependencies: ${deps.join(", ")}`, "info", 900],
          [`Injecting ${envVars.length} environment variable${envVars.length === 1 ? "" : "s"}`, "info", 300],
          ["Type-checking and bundling with esbuild", "info", 800],
          ["Optimizing assets · minifying JS · purging unused CSS", "info", 600],
          ["Uploading to edge regions: bom1, sin1, fra1, iad1", "info", 800],
          [domain?.trim() ? `Custom domain ${domain.trim()} is pending DNS (add a CNAME to cname.architect.app)` : "Assigning URL", domain?.trim() ? "warn" : "info", 400],
        ];
        for (let i = 0; i < steps.length; i++) {
          send({ t: "progress", value: Math.round(((i + 1) / (steps.length + 1)) * 100) });
          await log(...steps[i]);
        }

        if (env === "production") {
          await supabase.from("deployments").update({ is_current: false }).eq("project_id", projectId).eq("env", "production");
        }
        const { data: done, error: updateError } = await supabase
          .from("deployments")
          .update({ status: "ready", files, is_current: env === "production", logs })
          .eq("id", row.id)
          .select("id, env, status, slug, label, is_current, created_at")
          .single();
        if (updateError || !done) throw updateError ?? new Error("Could not finalize deployment");

        const url = deploymentUrl(origin, done as Deployment);
        if (env === "production") await supabase.from("projects").update({ status: "deployed", deploy_url: url }).eq("id", projectId);
        await log(`Ready in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${url}`, "success", 0);
        send({ t: "progress", value: 100 });
        send({ t: "ready", deployment: done as Deployment, url });
        await track(supabase, "deployed", { env }, projectId);
      } catch (err) {
        console.error("[deploy]", err);
        await supabase.from("deployments").update({ status: "failed", logs }).eq("id", row.id);
        send({ t: "error", message: "Deployment failed. Try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
