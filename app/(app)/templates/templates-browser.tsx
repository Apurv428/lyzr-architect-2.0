"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { createProject } from "@/lib/actions/projects";
// Imported here, not passed from the server page: templates carry icon components, which can't cross the server/client boundary.
import { TEMPLATES } from "@/lib/catalog";
import type { Mode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

const ALL = "All";

export function TemplatesBrowser({ mode }: { mode: Mode }) {
  const templates = TEMPLATES;
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState(ALL);
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<string>();

  const categories = useMemo(
    () => [ALL, ...Array.from(new Set(templates.map((t) => t.category)))],
    [templates],
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return templates.filter((t) => {
      const matchCat = activeCategory === ALL || t.category === activeCategory;
      const matchQ = !q || t.name.toLowerCase().includes(q) || t.tagline.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [templates, query, activeCategory]);

  function use(id: string) {
    setActive(id);
    startTransition(async () => {
      const res = await createProject({ templateId: id, mode });
      if (res?.error) toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-5 p-6">
      {/* Search + category filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates…"
            className="h-9 pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition",
                activeCategory === cat
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:border-primary/50 hover:text-foreground",
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          <p className="font-medium">No templates match &ldquo;{query}&rdquo;</p>
          <button type="button" onClick={() => { setQuery(""); setActiveCategory(ALL); }} className="text-xs underline-offset-4 hover:underline">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => (
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
      )}
    </div>
  );
}
