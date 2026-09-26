import { ShieldAlert } from "lucide-react";
import { Breakdown, Columns, Funnel, StatTile } from "@/components/metrics/charts";
import { getUser } from "@/lib/supabase/server";

type Summary = {
  funnel: { signed_up: number; onboarded: number; first_build: number; build_under_5m: number; deployed: number };
  plans: { proposed: number; approved: number; edited: number };
  quality: { builds: number; restores: number; autofix: number; projects_built: number };
  modes: { to_pro: number; to_guided: number; guided_projects: number; pro_projects: number };
  sources: Record<string, number>;
  north_star: { week: string; apps: number }[];
};

const rate = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card/60 p-5">
      <h2 className="font-medium">{title}</h2>
      {subtitle && <p className="mb-4 text-xs text-muted-foreground">{subtitle}</p>}
      {children}
    </section>
  );
}

export default async function MetricsPage() {
  const { supabase } = await getUser();
  const { data: isAdmin } = await supabase.rpc("is_admin");

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 py-20 text-center">
        <ShieldAlert className="mx-auto size-8 text-primary" />
        <h1 className="text-xl font-semibold">Metrics are for admins</h1>
        <p className="text-sm text-muted-foreground">Grant yourself access in the Supabase SQL editor:</p>
        <pre className="rounded-lg border bg-muted/40 p-3 text-left font-mono text-xs whitespace-pre-wrap">
          insert into public.admins select id from auth.users where email = &apos;you@example.com&apos;;
        </pre>
      </div>
    );
  }

  const { data, error } = await supabase.rpc("metrics_summary");
  if (error || !data) return <p className="p-10 text-sm text-destructive">Couldn’t load metrics: {error?.message}</p>;
  const m = data as Summary;
  const weekly = m.north_star.map((w) => ({ label: `wk ${w.week.slice(5)}`, value: w.apps }));
  const thisWeek = weekly.at(-1)?.value ?? 0;
  const lastWeek = weekly.at(-2)?.value ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Product metrics</h1>
        <p className="text-sm text-muted-foreground">The numbers the README promises — computed live from product events.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="North star · apps deployed this week" value={String(thisWeek)} hint={lastWeek ? `${thisWeek >= lastWeek ? "▲" : "▼"} vs ${lastWeek} last week` : "First week of data"} />
        <StatTile label="Activation · first build < 5 min" value={rate(m.funnel.build_under_5m, m.funnel.signed_up)} hint={`${m.funnel.build_under_5m} of ${m.funnel.signed_up} sign-ups`} />
        <StatTile label="Plan approval rate" value={rate(m.plans.approved, m.plans.proposed)} hint={`${m.plans.edited} plans edited before approval`} />
        <StatTile label="Restores per built project" value={m.quality.projects_built ? (m.quality.restores / m.quality.projects_built).toFixed(2) : "—"} hint="Lower = fewer AI mistakes" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Activation funnel" subtitle="Users reaching each step · % of sign-ups">
          <Funnel
            steps={[
              { label: "Signed up", value: m.funnel.signed_up },
              { label: "Onboarded", value: m.funnel.onboarded },
              { label: "First build", value: m.funnel.first_build },
              { label: "…within 5 min", value: m.funnel.build_under_5m },
              { label: "Deployed", value: m.funnel.deployed },
            ]}
          />
        </Card>
        <Card title="Apps deployed per week" subtitle="Distinct projects with a ready deploy · last 8 weeks">
          <Columns data={weekly} unit="apps" />
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Where projects start" subtitle="project_created by source">
          <Breakdown items={Object.entries(m.sources).map(([label, value]) => ({ label, value }))} />
        </Card>
        <Card title="Guided ⇄ Pro" subtitle="Is skill a dial? Mode mix and switches">
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Guided projects" value={String(m.modes.guided_projects)} />
            <StatTile label="Pro projects" value={String(m.modes.pro_projects)} />
            <StatTile label="Switched to Pro" value={String(m.modes.to_pro)} />
            <StatTile label="Switched to Guided" value={String(m.modes.to_guided)} />
          </div>
        </Card>
      </div>
    </div>
  );
}
