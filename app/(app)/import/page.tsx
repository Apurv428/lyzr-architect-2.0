import { ImportWizard } from "@/components/github/import-wizard";
import { ZipImport } from "@/components/github/zip-import";
import { githubStatus } from "@/lib/actions/github";

export default async function ImportPage() {
  const status = await githubStatus();
  return (
    <div className="space-y-8 px-4 py-10 sm:px-8">
      <header className="mx-auto max-w-3xl space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Import a project</h1>
        <p className="text-sm text-muted-foreground">
          Bring an existing app from GitHub or your computer. Architect loads its files, detects the stack, and keeps working on the code you have.
        </p>
      </header>
      <ImportWizard connected={status.connected} login={status.connected ? status.login : undefined} />
      <ZipImport />
    </div>
  );
}
