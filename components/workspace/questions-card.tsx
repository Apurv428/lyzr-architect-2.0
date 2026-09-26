"use client";

import { useState } from "react";
import { ArrowRight, Check, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Questions } from "@/lib/ai/schema";
import { cn } from "@/lib/utils";

const OTHER = "__other__";

export function QuestionsCard({
  data,
  open,
  busy,
  onAnswer,
  onSkip,
}: {
  data: Questions;
  open: boolean;
  busy: boolean;
  onAnswer: (text: string) => void;
  onSkip: () => void;
}) {
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [other, setOther] = useState<Record<string, string>>({});

  const answerFor = (id: string) => (picked[id] === OTHER ? other[id]?.trim() : picked[id]);
  const complete = data.questions.every((q) => answerFor(q.id));

  function submit() {
    if (!complete || busy) return;
    onAnswer(data.questions.map((q) => `${q.question} → ${answerFor(q.id)}`).join("\n"));
  }

  return (
    <div className={cn("overflow-hidden rounded-2xl border bg-card", open ? "glow" : "opacity-70")}>
      <div className="flex items-center gap-2 border-b bg-primary/5 px-4 py-2.5 text-sm">
        <HelpCircle className="size-4 text-primary" />
        <span className="font-medium">{open ? "Quick questions" : "Questions"}</span>
        {!open && <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400"><Check className="size-3" /> Answered</span>}
      </div>
      <div className="space-y-4 p-4">
        {data.intro && <p className="text-sm text-muted-foreground">{data.intro}</p>}
        {data.questions.map((q, i) => (
          <fieldset key={q.id} className="space-y-2" disabled={!open || busy}>
            <legend className="mb-2 text-sm font-medium">
              <span className="mr-1.5 text-muted-foreground">{i + 1}.</span>
              {q.question}
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {[...q.options, ...(q.allow_other ? [OTHER] : [])].map((opt) => {
                const active = picked[q.id] === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPicked((p) => ({ ...p, [q.id]: opt }))}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition disabled:cursor-default",
                      active ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/50",
                    )}
                  >
                    {opt === OTHER ? "Other…" : opt}
                  </button>
                );
              })}
            </div>
            {picked[q.id] === OTHER && (
              <input
                autoFocus
                value={other[q.id] ?? ""}
                onChange={(e) => setOther((o) => ({ ...o, [q.id]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="Type your answer"
                className="h-8 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:border-primary"
              />
            )}
          </fieldset>
        ))}
      </div>
      {open && (
        <div className="flex items-center gap-3 border-t p-3">
          <Button size="lg" className="flex-1" onClick={submit} disabled={!complete || busy}>
            Continue to plan <ArrowRight />
          </Button>
          <button onClick={onSkip} disabled={busy} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
            Skip, just plan it
          </button>
        </div>
      )}
    </div>
  );
}
