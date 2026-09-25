import { ImportWizard } from "@/components/github/import-wizard";
import { githubStatus } from "@/lib/actions/github";

export default async function ImportPage() {
  const status = await githubStatus();
  return (
    <div className="px-4 py-10 sm:px-8">
      <header className="mx-auto mb-8 max-w-3xl space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Import from GitHub</h1>
        <p className="text-sm text-muted-foreground">Architect reads your repo, detects the stack, and plans agents that fit — without rewriting what works.</p>
      </header>
      <ImportWizard connected={status.connected} login={status.connected ? status.login : undefined} />
    </div>
  );
}
