import Link from "next/link";
import { ExternalLink, Rocket } from "lucide-react";
import { headers } from "next/headers";
import { deploymentUrl, type Deployment } from "@/lib/deploy";
import { getUser } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

type Row = Deployment & { project: { id: string; name: string } | null };

export default async function DeploymentsPage() {
  const { supabase, user } = await getUser();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const { data } = await supabase
    .from("deployments")
    .select("id, env, status, slug, label, is_current, created_at, project:projects(id, name)")
    .eq("owner_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Deployments</h1>
        <p className="text-sm text-muted-foreground">Every version you’ve shipped, across all projects.</p>
      </header>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card/30 px-6 py-14 text-center">
          <Rocket className="size-6 text-primary" />
          <p className="font-medium">Nothing deployed yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">Open a project and hit Deploy — you’ll get a public link in seconds.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Project</th>
                <th className="px-4 py-2 font-medium">Environment</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-t">
                  <td className="px-4 py-3">
                    {d.project ? <Link href={`/p/${d.project.id}`} className="font-medium hover:underline">{d.project.name}</Link> : d.label}
                  </td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">
                    {d.env}
                    {d.is_current && <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-600 dark:text-emerald-400 normal-case">current</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 capitalize">
                      <span className={cn("size-2 rounded-full", d.status === "ready" ? "bg-emerald-400" : d.status === "failed" ? "bg-destructive" : "bg-amber-400")} />
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{timeAgo(d.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    {d.status === "ready" && (
                      <a href={deploymentUrl(origin, d)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        Visit <ExternalLink className="size-3" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
