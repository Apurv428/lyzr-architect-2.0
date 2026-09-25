"use client";

import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveGithubToken } from "@/lib/actions/github";
import { createClient } from "@/lib/supabase/client";

export function ConnectGitHub({ next, onConnected }: { next: string; onConnected: (login: string) => void }) {
  const [showPat, setShowPat] = useState(false);
  const [pat, setPat] = useState("");
  const [pending, setPending] = useState<"oauth" | "pat" | null>(null);

  async function oauth() {
    setPending("oauth");
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`, scopes: "read:user user:email repo" },
    });
    if (error) {
      toast.error(error.message);
      setPending(null);
    }
  }

  async function savePat() {
    setPending("pat");
    const res = await saveGithubToken(pat);
    setPending(null);
    if ("error" in res) toast.error(res.error);
    else {
      toast.success(`Connected as @${res.login}`);
      onConnected(res.login);
    }
  }

  return (
    <div className="space-y-3">
      <Button size="lg" className="w-full" onClick={oauth} disabled={!!pending}>
        {pending === "oauth" ? <Loader2 className="animate-spin" /> : (
          <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden><path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.1c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.9 1.3 1.9 1.3 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.3-3.2-.1-.3-.6-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.7.2 2.9.1 3.2.8.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5Z" /></svg>
        )}
        Connect GitHub
      </Button>
      {showPat ? (
        <div className="flex gap-2">
          <input
            type="password"
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            placeholder="ghp_… or github_pat_…"
            className="h-9 flex-1 rounded-lg border bg-background px-3 font-mono text-xs outline-none focus:border-primary"
          />
          <Button variant="outline" size="lg" onClick={savePat} disabled={!pat || !!pending}>
            {pending === "pat" ? <Loader2 className="animate-spin" /> : "Save"}
          </Button>
        </div>
      ) : (
        <button onClick={() => setShowPat(true)} className="inline-flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <KeyRound className="size-3.5" /> Use a personal access token instead
        </button>
      )}
    </div>
  );
}
