"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Code2, Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { completeOnboarding } from "@/lib/actions/profile";
import { ROLES, TEMPLATES } from "@/lib/catalog";
import { cn } from "@/lib/utils";

const STEPS = ["About you", "Your style", "First build"] as const;

function dialCopy(level: number) {
  if (level < 25) return { title: "Show me no code", body: "Plain-English plans, visual agent builder, one-click deploy. Code stays out of sight." };
  if (level < 50) return { title: "Guide me, let me peek", body: "Guided flows by default, with a read-only peek at the code when you're curious." };
  if (level < 75) return { title: "Let me steer", body: "Code, diffs and framework choice up front — with plans and checkpoints as a safety net." };
  return { title: "Give me full control", body: "Repo import, framework picker, diffs, env & secrets, API endpoints. Nothing hidden." };
}

export function Onboarding({ firstName, next }: { firstName: string; next: string }) {
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<string>("");
  const [level, setLevel] = useState(30);
  const [templateId, setTemplateId] = useState<string>();
  const [prompt, setPrompt] = useState("");
  const [pending, startTransition] = useTransition();

  const dial = dialCopy(level);
  const pro = level >= 50;
  const canContinue = step === 0 ? !!role : true;

  function finish(skipBuild = false) {
    startTransition(async () => {
      const res = await completeOnboarding({
        role: role || "other",
        experienceLevel: level,
        templateId: skipBuild ? undefined : templateId,
        prompt: skipBuild ? undefined : prompt,
        next,
      });
      if (res?.error) toast.error(res.error);
    });
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center px-4 py-10">
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className="relative flex w-full max-w-2xl flex-col gap-8">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div className="flex flex-1 gap-2">
            {STEPS.map((label, i) => (
              <div key={label} className="flex-1 space-y-1.5">
                <div className={cn("h-1 rounded-full transition-colors", i <= step ? "bg-primary" : "bg-muted")} />
                <p className={cn("text-xs", i === step ? "text-foreground" : "text-muted-foreground")}>{label}</p>
              </div>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.section
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {step === 0 && (
              <>
                <header className="space-y-2">
                  <h1 className="text-3xl font-semibold tracking-tight">Hi {firstName} 👋 What do you do?</h1>
                  <p className="text-muted-foreground">We’ll tailor Architect to how you work. You can change this anytime.</p>
                </header>
                <div className="grid gap-3 sm:grid-cols-2">
                  {ROLES.map(({ id, label, hint, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setRole(id);
                        setLevel(id === "developer" || id === "data" ? 80 : id === "founder" ? 45 : 20);
                      }}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border bg-card/60 p-4 text-left transition hover:border-primary/60",
                        role === id && "border-primary bg-primary/10 ring-2 ring-primary/30",
                      )}
                    >
                      <span className="grid size-10 place-items-center rounded-lg bg-muted">
                        <Icon className="size-5" />
                      </span>
                      <span>
                        <span className="block font-medium">{label}</span>
                        <span className="block text-sm text-muted-foreground">{hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <header className="space-y-2">
                  <h1 className="text-3xl font-semibold tracking-tight">How much control do you want?</h1>
                  <p className="text-muted-foreground">
                    Technical skill is a dial, not a label. This sets your default mode — every project can flip between Guided and Pro.
                  </p>
                </header>
                <div className="space-y-6 rounded-2xl border bg-card/60 p-6">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><Wand2 className="size-4" /> No code</span>
                    <span className="inline-flex items-center gap-1.5">Full control <Code2 className="size-4" /></span>
                  </div>
                  <Slider
                    value={[level]}
                    onValueChange={(v) => setLevel(Array.isArray(v) ? v[0] : v)}
                    min={0}
                    max={100}
                    step={1}
                  />
                  <div className="flex items-start gap-4 rounded-xl bg-muted/50 p-4">
                    <span className={cn("rounded-md px-2 py-1 text-xs font-medium", pro ? "bg-primary/20 text-primary" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400")}>
                      {pro ? "Pro mode" : "Guided mode"}
                    </span>
                    <div>
                      <p className="font-medium">{dial.title}</p>
                      <p className="text-sm text-muted-foreground">{dial.body}</p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <header className="space-y-2">
                  <h1 className="text-3xl font-semibold tracking-tight">What should we build first?</h1>
                  <p className="text-muted-foreground">Pick a starting point or describe your own idea — Architect will propose a plan before writing anything.</p>
                </header>
                <div className="grid gap-3 sm:grid-cols-3">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setTemplateId(templateId === t.id ? undefined : t.id);
                        setPrompt("");
                      }}
                      className={cn(
                        "group relative overflow-hidden rounded-xl border bg-card/60 p-4 text-left transition hover:border-primary/60",
                        templateId === t.id && "border-primary ring-2 ring-primary/30",
                      )}
                    >
                      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-60", t.accent)} />
                      <t.icon className="relative mb-3 size-5" />
                      <p className="relative text-sm font-medium">{t.name}</p>
                      <p className="relative mt-1 line-clamp-2 text-xs text-muted-foreground">{t.tagline}</p>
                    </button>
                  ))}
                </div>
                <Textarea
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    if (e.target.value) setTemplateId(undefined);
                  }}
                  placeholder="…or describe it: “An agent that reads our sales calls and updates HubSpot”"
                  className="min-h-24 resize-none bg-card/60"
                />
              </>
            )}
          </motion.section>
        </AnimatePresence>

        <footer className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0 || pending}>
            <ArrowLeft /> Back
          </Button>
          <div className="flex gap-2">
            {step === 2 && (
              <Button variant="ghost" onClick={() => finish(true)} disabled={pending}>
                Skip to dashboard
              </Button>
            )}
            {step < 2 ? (
              <Button size="lg" onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>
                Continue <ArrowRight />
              </Button>
            ) : (
              <Button size="lg" onClick={() => finish()} disabled={pending || (!templateId && !prompt.trim())}>
                {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                Start building
              </Button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
