import { Columns, StatTile } from "@/components/metrics/charts";
import { DangerZone, GitHubSection, ModelKeysForm, PreferencesForm, ProfileForm, Section, TeammatesSection } from "@/components/settings/settings-sections";
import { githubStatus } from "@/lib/actions/github";
import { DAILY_CREDITS, currentCredits } from "@/lib/credits";
import { decrypt } from "@/lib/crypto";
import { getUser } from "@/lib/supabase/server";
import type { Mode } from "@/lib/types";

const mask = (key: string | null) => (key ? `${key.slice(0, 7)}…${key.slice(-4)}` : null);
const AI_EVENTS = ["plan_proposed", "build_succeeded", "agent_tested"];

/** The last `n` UTC days (oldest first) and the start of the window. */
function lastDays(n: number) {
  const since = new Date(Date.now() - (n - 1) * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);
  const days = Array.from({ length: n }, (_, i) => new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10));
  return { since, days };
}

export default async function SettingsPage() {
  const { supabase, user } = await getUser();
  const { since, days } = lastDays(14);

  const [{ data: profile }, { data: secrets }, credits, github, { data: events }] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url, default_mode, experience_level, model_provider").eq("id", user!.id).single(),
    supabase.from("user_secrets").select("anthropic_key, openai_key").eq("owner_id", user!.id).maybeSingle(),
    currentCredits(supabase),
    githubStatus(),
    supabase.from("events").select("name, created_at").in("name", AI_EVENTS).gte("created_at", since.toISOString()),
  ]);

  const perDay = new Map(days.map((d) => [d, 0]));
  for (const e of events ?? []) {
    const day = e.created_at.slice(0, 10);
    if (perDay.has(day)) perDay.set(day, perDay.get(day)! + 1);
  }
  const total = [...perDay.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Your profile, how Architect works for you, and the keys it runs on.</p>
      </header>

      <Section title="Profile">
        <ProfileForm fullName={profile?.full_name ?? ""} avatarUrl={profile?.avatar_url ?? ""} email={user!.email ?? ""} />
      </Section>

      <Section title="Preferences" description="Technical skill is a dial — set your default, flip any project any time.">
        <PreferencesForm defaultMode={(profile?.default_mode ?? "guided") as Mode} experienceLevel={profile?.experience_level ?? 50} />
      </Section>

      <Section title="AI models" description="Use your own Anthropic or OpenAI key. Calls on your key don’t spend credits.">
        <ModelKeysForm
          preference={(profile?.model_provider as "anthropic" | "openai" | null) ?? null}
          anthropicMasked={mask(decrypt(secrets?.anthropic_key))}
          openaiMasked={mask(decrypt(secrets?.openai_key))}
        />
      </Section>

      <Section title="Usage" description={`${DAILY_CREDITS} credits a day on the Free plan, refilled at midnight UTC.`}>
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Credits left today" value={`${credits} / ${DAILY_CREDITS}`} />
          <StatTile label="AI actions · last 14 days" value={String(total)} hint="Plans, builds and agent tests" />
        </div>
        <Columns data={days.map((d) => ({ label: d.slice(5), value: perDay.get(d)! }))} unit="AI actions" />
      </Section>

      <Section title="Team" description="Invite teammates and manage their roles. RBAC and audit logs are available on Team and Enterprise plans.">
        <TeammatesSection />
      </Section>

      <Section title="GitHub" description="Used for importing repos and opening pull requests.">
        <GitHubSection login={github.connected ? github.login : null} />
      </Section>

      <Section title="Danger zone" danger>
        <DangerZone />
      </Section>
    </div>
  );
}
