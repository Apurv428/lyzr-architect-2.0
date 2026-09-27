import { IntegrationsView } from "@/components/integrations/integrations-view";
import { listWebhookAgents, listWebhooks } from "@/lib/actions/webhooks";

export default async function IntegrationsPage(props: PageProps<"/integrations">) {
  const { agent } = await props.searchParams;
  const [{ rows, setupNeeded }, agents] = await Promise.all([listWebhooks(), listWebhookAgents()]);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground">Connect your agents to the rest of your stack.</p>
      </header>
      <IntegrationsView initialWebhooks={rows} agents={agents} setupNeeded={setupNeeded} preselectAgentId={typeof agent === "string" ? agent : null} />
    </div>
  );
}
