"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type Provider = "google";

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
      },
    });
    if (error) {
      toast.error(error.message);
      setPending(null);
    }
  }

  return (
    <Button variant="outline" size="lg" className="w-full" onClick={() => signInWith("google")} disabled={!!pending}>
      {pending === "google" ? <Loader2 className="animate-spin" /> : <GoogleIcon />}
      Continue with Google
    </Button>
  );
}
