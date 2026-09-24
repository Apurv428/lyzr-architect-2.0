"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type Provider = "github" | "google";

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
      <path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.1c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.9 1.3 1.9 1.3 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.3-3.2-.1-.3-.6-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.7.2 2.9.1 3.2.8.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12Z" />
    </svg>
  );
}

export function OAuthButtons({ next }: { next: string }) {
  const [pending, setPending] = useState<Provider | null>(null);

  async function signInWith(provider: Provider) {
    if (!isSupabaseConfigured) {
      toast.error("Supabase isn't configured yet — add keys to .env.local.");
      return;
    }
    setPending(provider);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        // GitHub token is reused later for repo import & PRs.
        scopes: provider === "github" ? "read:user user:email repo" : undefined,
      },
    });
    if (error) {
      toast.error(error.message);
      setPending(null);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <Button variant="outline" size="lg" onClick={() => signInWith("github")} disabled={!!pending}>
        {pending === "github" ? <Loader2 className="animate-spin" /> : <GitHubIcon />}
        GitHub
      </Button>
      <Button variant="outline" size="lg" onClick={() => signInWith("google")} disabled={!!pending}>
        {pending === "google" ? <Loader2 className="animate-spin" /> : <GoogleIcon />}
        Google
      </Button>
    </div>
  );
}
