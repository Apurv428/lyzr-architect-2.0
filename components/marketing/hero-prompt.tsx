"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TEMPLATES } from "@/lib/catalog";

export function HeroPrompt() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");

  function go(text = prompt) {
    if (!text.trim()) return;
    router.push(`/dashboard?prompt=${encodeURIComponent(text.trim())}`);
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
        className="glow flex items-end gap-2 rounded-2xl border bg-card/80 p-3 text-left backdrop-blur focus-within:border-primary/60"
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              go();
            }
          }}
          rows={2}
          aria-label="Describe what you want to build"
          placeholder="An agent that triages support tickets and drafts replies…"
          className="flex-1 resize-none bg-transparent px-2 py-1.5 text-base outline-none placeholder:text-muted-foreground/70"
        />
        <Button type="submit" size="icon-lg" aria-label="Start building" disabled={!prompt.trim()}>
          <ArrowUp />
        </Button>
      </form>
      <div className="flex flex-wrap justify-center gap-2">
        {TEMPLATES.slice(0, 4).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setPrompt(t.prompt)}
            className="inline-flex items-center gap-1.5 rounded-full border bg-card/40 px-3 py-1 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
          >
            <t.icon className="size-3.5" /> {t.name}
          </button>
        ))}
      </div>
    </div>
  );
}
