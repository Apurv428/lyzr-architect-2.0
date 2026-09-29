"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModeToggle } from "@/components/app/mode-toggle";
import { deleteProject, updateProject } from "@/lib/actions/projects";
import { removeSlackWebhook, saveSlackWebhook } from "@/lib/actions/agents";
import { setProjectWorkspace } from "@/lib/actions/workspaces";
import type { Mode } from "@/lib/types";

const field = "w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function ProjectSettingsForm({
  projectId,
  name: initialName,
  mode: initialMode,
  slackConfigured: initialSlackConfigured,
  workspaceId: initialWorkspaceId,
  workspaces,
  sharingSetupNeeded,
}: {
  projectId: string;
  name: string;
  mode: Mode;
  slackConfigured: boolean;
  workspaceId: string | null;
  workspaces: { id: string; name: string }[];
  sharingSetupNeeded: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Name
  const [name, setName] = useState(initialName);
  // The delete confirmation matches the saved name, not whatever is half-typed in the name box.
  const [savedName, setSavedName] = useState(initialName);
  const [nameSaved, setNameSaved] = useState(false);

  // Sharing
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId ?? "");
  const [sharing, setSharing] = useState(false);

  async function changeWorkspace(next: string) {
    const previous = workspaceId;
    setWorkspaceId(next);
    setSharing(true);
    const res = await setProjectWorkspace(projectId, next || null);
    setSharing(false);
    if ("error" in res) {
      setWorkspaceId(previous);
      toast.error(res.error);
      return;
    }
    toast.success(next ? `Shared with ${workspaces.find((w) => w.id === next)?.name ?? "the workspace"}.` : "No longer shared.");
  }

  function saveName() {
    const next = name.trim();
    if (!next || next === savedName) return;
    startTransition(async () => {
      const res = await updateProject(projectId, { name: next });
      if (res.error) { toast.error(res.error); return; }
      setSavedName(next);
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2000);
      router.refresh();
    });
  }

  // Mode
  const [mode, setMode] = useState<Mode>(initialMode);

  function changeMode(next: Mode) {
    setMode(next);
    startTransition(async () => {
      const res = await updateProject(projectId, { mode: next });
      if (res.error) toast.error(res.error);
      else toast(next === "pro" ? "Switched to Pro mode" : "Switched to Guided mode");
    });
  }

  // Slack
  const [slackConfigured, setSlackConfigured] = useState(initialSlackConfigured);
  const [webhookDraft, setWebhookDraft] = useState("");
  const [slackPending, startSlackTransition] = useTransition();

  function saveWebhook() {
    startSlackTransition(async () => {
      const res = await saveSlackWebhook(projectId, webhookDraft);
      if ("error" in res) { toast.error(res.error); return; }
      setSlackConfigured(true);
      setWebhookDraft("");
      toast.success("Slack webhook saved.");
    });
  }

  function removeWebhook() {
    startSlackTransition(async () => {
      const res = await removeSlackWebhook(projectId);
      if ("error" in res) { toast.error(res.error); return; }
      setSlackConfigured(false);
      toast("Slack webhook removed.");
    });
  }

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, startDeleteTransition] = useTransition();

  function handleDelete() {
    if (deleteConfirm !== name) return;
    startDeleteTransition(async () => {
      const res = await deleteProject(projectId);
      if (res?.error) { toast.error(res.error); return; }
      router.push("/dashboard");
    });
  }

  return (
    <div className="space-y-5">
      {/* Name */}
      <Section title="Project name">
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveName()}
            className="h-9"
          />
          <Button size="sm" variant="outline" className="shrink-0" disabled={pending || !name.trim() || name.trim() === initialName} onClick={saveName}>
            {nameSaved ? <CheckCircle2 className="size-4 text-emerald-500" /> : pending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </Section>

      {/* Mode */}
      <Section title="Default mode" hint="Controls how AI replies are formatted and how much code is shown.">
        <ModeToggle value={mode} onChange={changeMode} layoutId="settings-mode" />
      </Section>

      {/* Slack */}
      <Section
        title="Slack webhook"
        hint="When set, the agent's Post to Slack action sends real messages to your Slack channel."
      >
        {slackConfigured ? (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
            <span className="flex-1 text-sm">Webhook configured</span>
            <button
              onClick={removeWebhook}
              disabled={slackPending}
              className="text-xs text-muted-foreground underline-offset-4 hover:underline hover:text-foreground"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              value={webhookDraft}
              onChange={(e) => setWebhookDraft(e.target.value)}
              placeholder="https://hooks.slack.com/services/…"
              className={field}
              type="url"
              autoComplete="off"
            />
            <Button
              size="sm"
              className="w-full"
              disabled={slackPending || !webhookDraft.trim()}
              onClick={saveWebhook}
            >
              {slackPending ? <><Loader2 className="size-3 animate-spin" /> Saving…</> : "Save webhook"}
            </Button>
            <p className="text-xs text-muted-foreground">
              <a
                href="https://api.slack.com/messaging/webhooks"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Create an incoming webhook
              </a>{" "}
              in your Slack workspace.
            </p>
          </div>
        )}
      </Section>

      {/* Sharing */}
      <Section title="Sharing" hint="Members of the workspace can open this project read-only and comment on the preview.">
        {sharingSetupNeeded ? (
          <p className="text-xs text-muted-foreground">
            Sharing needs the database update in <code>supabase/migrations/0011_workspaces.sql</code>.
          </p>
        ) : workspaces.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Create a workspace in{" "}
            <a href="/settings" className="text-primary underline">
              Settings → Team
            </a>{" "}
            to share projects with teammates.
          </p>
        ) : (
          <div className="flex items-center gap-2">
            <select value={workspaceId} onChange={(e) => changeWorkspace(e.target.value)} disabled={sharing} className={field}>
              <option value="">Not shared (only you)</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            {sharing && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
          </div>
        )}
      </Section>

      {/* Danger zone */}
      <Section title="Danger zone">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Deleting a project removes all messages, checkpoints, deployments and agent data. Type the project name to confirm.
          </p>
          <input
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder={`Type "${savedName}" to confirm`}
            className={field}
          />
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            disabled={deleting || deleteConfirm !== savedName}
            onClick={handleDelete}
          >
            {deleting ? <><Loader2 className="size-3 animate-spin" /> Deleting…</> : <><Trash2 className="size-4" /> Delete project</>}
          </Button>
        </div>
      </Section>
    </div>
  );
}
