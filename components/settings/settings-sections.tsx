"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Code2, KeyRound, Loader2, RotateCcw, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { clearTourDone } from "@/components/app/tour";
import { ConnectGitHub } from "@/components/github/connect-github";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { disconnectGithub } from "@/lib/actions/github";
import { resetTour } from "@/lib/actions/profile";
import { deleteAllProjects, saveModelKey, updatePreferences, updateProfile } from "@/lib/actions/settings";
import type { Mode } from "@/lib/types";
import { cn } from "@/lib/utils";

const input = "h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:border-primary";

export function Section({ title, description, children, danger }: { title: string; description?: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <section className={cn("grid gap-4 rounded-2xl border bg-card/60 p-5 md:grid-cols-[220px_1fr]", danger && "border-destructive/40")}>
      <div>
        <h2 className={cn("font-medium", danger && "text-destructive")}>{title}</h2>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}

export function ProfileForm({ fullName, avatarUrl, email }: { fullName: string; avatarUrl: string; email: string }) {
  const [name, setName] = useState(fullName);
  const [avatar, setAvatar] = useState(avatarUrl);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <label className="block space-y-1.5 text-sm">
        <span className="text-xs font-medium">Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="text-xs font-medium">Avatar URL</span>
        <input value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="https://…" className={input} />
      </label>
      <p className="text-xs text-muted-foreground">Signed in as {email}</p>
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await updateProfile({ fullName: name, avatarUrl: avatar });
            if (res.error) toast.error(res.error);
            else {
              toast.success("Profile saved");
              router.refresh();
            }
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <Check />} Save profile
      </Button>
    </>
  );
}

export function PreferencesForm({ defaultMode, experienceLevel }: { defaultMode: Mode; experienceLevel: number }) {
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [level, setLevel] = useState(experienceLevel);
  const save = async (patch: Parameters<typeof updatePreferences>[0]) => {
    const res = await updatePreferences(patch);
    if (res.error) toast.error(res.error);
  };
  return (
    <>
      <div className="space-y-1.5">
        <p className="text-xs font-medium">Default mode for new projects</p>
        <div className="grid grid-cols-2 gap-2">
          {(["guided", "pro"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                void save({ defaultMode: m });
              }}
              className={cn("flex items-center gap-2 rounded-xl border p-3 text-left text-sm", mode === m ? "border-primary bg-primary/10" : "hover:border-primary/40")}
            >
              {m === "guided" ? <Wand2 className="size-4" /> : <Code2 className="size-4" />}
              <span>
                <span className="block font-medium capitalize">{m}</span>
                <span className="block text-xs text-muted-foreground">{m === "guided" ? "Plain language, no code" : "Code, diffs, frameworks"}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="flex justify-between text-xs font-medium">
          Experience dial <span className="text-muted-foreground">{level < 50 ? "Guide me" : "Give me control"}</span>
        </p>
        <Slider
          value={[level]}
          min={0}
          max={100}
          onValueChange={(v) => setLevel(Array.isArray(v) ? v[0] : v)}
          onValueCommitted={(v) => void save({ experienceLevel: Array.isArray(v) ? v[0] : v })}
        />
      </div>
      <div className="flex items-center justify-between rounded-lg border px-3 py-2">
        <span className="text-sm">Theme</span>
        <ThemeToggle />
      </div>
      <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
        <span className="text-sm">
          Product tour
          <span className="block text-xs text-muted-foreground">A 1-minute walkthrough of the workspace</span>
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            const res = await resetTour();
            if ("error" in res) return toast.error(res.error);
            clearTourDone();
            toast.success("The tour will play the next time you open a project");
          }}
        >
          <RotateCcw /> Replay tour
        </Button>
      </div>
    </>
  );
}

export function ModelKeysForm({
  preference,
  anthropicMasked,
  openaiMasked,
}: {
  preference: "anthropic" | "openai" | null;
  anthropicMasked: string | null;
  openaiMasked: string | null;
}) {
  const [pref, setPref] = useState(preference);
  const [masked, setMasked] = useState({ anthropic: anthropicMasked, openai: openaiMasked });
  const [drafts, setDrafts] = useState({ anthropic: "", openai: "" });
  const [pending, setPending] = useState<"anthropic" | "openai" | null>(null);

  async function saveKey(provider: "anthropic" | "openai", value: string | null) {
    setPending(provider);
    const res = await saveModelKey(provider, value);
    setPending(null);
    if ("error" in res) return void toast.error(res.error);
    setMasked((m) => ({ ...m, [provider]: res.masked }));
    setDrafts((d) => ({ ...d, [provider]: "" }));
    toast.success(value ? "Key verified and saved (encrypted)" : "Key removed");
  }

  return (
    <>
      <div className="space-y-1.5">
        <p className="text-xs font-medium">Preferred provider</p>
        <select
          value={pref ?? ""}
          onChange={async (e) => {
            const v = (e.target.value || null) as typeof pref;
            setPref(v);
            const res = await updatePreferences({ modelProvider: v });
            if (res.error) toast.error(res.error);
          }}
          className={input}
        >
          <option value="">Automatic</option>
          <option value="anthropic">Claude (Anthropic)</option>
          <option value="openai">GPT (OpenAI)</option>
        </select>
      </div>
      {(["anthropic", "openai"] as const).map((p) => (
        <div key={p} className="space-y-1.5">
          <p className="text-xs font-medium">{p === "anthropic" ? "Anthropic API key" : "OpenAI API key"}</p>
          {masked[p] ? (
            <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm">
              <KeyRound className="size-4 text-muted-foreground" />
              <span className="font-mono text-xs">{masked[p]}</span>
              <span className="text-xs text-emerald-600 dark:text-emerald-400">in use · no credits spent</span>
              <Button size="xs" variant="ghost" className="ml-auto" disabled={pending === p} onClick={() => saveKey(p, null)}>
                Remove
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="password"
                value={drafts[p]}
                onChange={(e) => setDrafts((d) => ({ ...d, [p]: e.target.value }))}
                placeholder={p === "anthropic" ? "sk-ant-…" : "sk-…"}
                className={cn(input, "font-mono text-xs")}
              />
              <Button variant="outline" disabled={!drafts[p] || pending === p} onClick={() => saveKey(p, drafts[p])}>
                {pending === p ? <Loader2 className="animate-spin" /> : "Verify & save"}
              </Button>
            </div>
          )}
        </div>
      ))}
      <p className="text-xs text-muted-foreground">Keys are verified with the provider, encrypted at rest (AES-256-GCM) and never sent back to your browser.</p>
    </>
  );
}

export function GitHubSection({ login }: { login: string | null }) {
  const [connected, setConnected] = useState(login);
  if (!connected) return <div className="max-w-xs"><ConnectGitHub next="/settings" onConnected={setConnected} /></div>;
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
      Connected as <span className="font-medium">@{connected}</span>
      <Button
        size="xs"
        variant="ghost"
        className="ml-auto"
        onClick={async () => {
          await disconnectGithub();
          setConnected(null);
          toast("GitHub disconnected");
        }}
      >
        Disconnect
      </Button>
    </div>
  );
}

export function DangerZone() {
  const [phrase, setPhrase] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Deletes every project with its chats, checkpoints, agents and deployments. Live links stop working. Type <span className="font-mono text-foreground">delete my projects</span> to confirm.
      </p>
      <div className="flex gap-2">
        <input value={phrase} onChange={(e) => setPhrase(e.target.value)} className={cn(input, "focus:border-destructive")} />
        <Button
          variant="destructive"
          disabled={phrase !== "delete my projects" || pending}
          onClick={() =>
            start(async () => {
              const res = await deleteAllProjects(phrase);
              if ("error" in res) return void toast.error(res.error);
              toast.success(`Deleted ${res.deleted} project${res.deleted === 1 ? "" : "s"}`);
              setPhrase("");
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete all
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Deleting the account itself needs a server-side admin key, so it’s handled on request for now.</p>
    </>
  );
}
