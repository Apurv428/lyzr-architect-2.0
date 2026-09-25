"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createProject } from "@/lib/actions/projects";
import { TEMPLATES } from "@/lib/catalog";
import type { Mode } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TemplateGrid({ mode }: { mode: Mode }) {
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<string>();

  function use(id: string) {
    setActive(id);
    startTransition(async () => {
      const res = await createProject({ templateId: id, mode });
      if (res?.error) toast.error(res.error);
    });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {TEMPLATES.map((t) => (
        <button
          key={t.id}
          type="button"
          disabled={pending}
          onClick={() => use(t.id)}
          className="group relative overflow-hidden rounded-xl border bg-card/60 p-4 text-left transition hover:border-primary/50 disabled:opacity-70"
        >
          <div className={cn("absolute inset-0 bg-gradient-to-br opacity-50 transition group-hover:opacity-80", t.accent)} />
          <div className="relative flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-background/60">
              <t.icon className="size-4.5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{t.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t.tagline}</p>
            </div>
            <span className="ml-auto text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground">
              {pending && active === t.id ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
            </span>
          </div>
          <span className="relative mt-3 inline-block rounded-full bg-background/50 px-2 py-0.5 text-[11px] text-muted-foreground">
            {t.category}
          </span>
        </button>
      ))}
    </div>
  );
}
