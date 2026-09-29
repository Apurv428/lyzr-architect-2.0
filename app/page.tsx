import Link from "next/link";
import {
  ArrowRight,
  Ban,
  Bot,
  Check,
  Code2,
  FolderGit2,
  History,
  ListChecks,
  MousePointerClick,
  Rocket,
  ShieldCheck,
  Wand2,
} from "lucide-react";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { HeroPrompt } from "@/components/marketing/hero-prompt";
import { cn } from "@/lib/utils";

const STEPS = [
  { icon: Wand2, title: "Describe", body: "Say what you need in plain words — or import a repo." },
  { icon: ListChecks, title: "Approve the plan", body: "Screens, data, agent steps and rules — reviewed before any code is written." },
  { icon: MousePointerClick, title: "Refine live", body: "Click anything in the preview to change it. Every change is a checkpoint." },
  { icon: Rocket, title: "Ship", body: "One-click deploy to a public link, or open a pull request to your repo." },
];

const NOT_LIST = [
  { title: "Not a general-purpose IDE", body: "Architect generates and ships agentic apps. It won't replace VS Code for everyday coding or maintain large existing codebases." },
  { title: "Not a CI/CD pipeline", body: "Deployments are one-click app links. For branch protection and test gates, connect your existing CI." },
  { title: "Not a model fine-tuning tool", body: "Architect configures how models behave — it doesn't train them. Bring a fine-tuned model from anywhere and wire it in as a provider." },
  { title: "Not a drag-and-drop builder", body: "Architect writes real, exportable code. No proprietary block format — export to GitHub and keep coding in any editor." },
];

const FEATURES = [
  { icon: Bot, title: "Agents are first-class", body: "Tools, memory, knowledge and guardrails built alongside your app — on a visual canvas or in code." },
  { icon: History, title: "Never stuck", body: "Checkpoints on every change, one-click restore, and auto-fix when something breaks." },
  { icon: FolderGit2, title: "Your code, your repo", body: "GitHub import, branches and PRs. Export anytime — no lock-in." },
  { icon: Code2, title: "Pick your framework", body: "Lyzr ADK, LangGraph, CrewAI, OpenAI Agents SDK, Claude Agent SDK and more." },
  { icon: ShieldCheck, title: "Safe by default", body: "Custom rules and automatic PII redaction on every reply — with a step-by-step trace of what the agent did." },
  { icon: Rocket, title: "Deploy in one click", body: "Public share links, preview and production environments, and instant rollback to any version." },
];

export default function Home() {
  return (
    <div className="relative overflow-hidden">
      <div className="bg-grid pointer-events-none absolute inset-0 h-[720px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className="pointer-events-none absolute -top-60 left-1/2 size-[900px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />

      <header className="relative mx-auto flex max-w-6xl items-center gap-6 px-4 py-5 sm:px-8">
        <Logo />
        <nav className="hidden gap-6 text-sm text-muted-foreground sm:flex">
          <a href="#how" className="hover:text-foreground">How it works</a>
          <a href="#modes" className="hover:text-foreground">Guided & Pro</a>
          <a href="#features" className="hover:text-foreground">Features</a>
          <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className={buttonVariants({ variant: "ghost" })}>Sign in</Link>
          <Link href="/signup" className={buttonVariants()}>Get started</Link>
        </div>
      </header>

      <main className="relative">
        <section className="mx-auto max-w-4xl space-y-8 px-4 pt-16 pb-24 text-center sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-400" /> Now with GitHub import & multi-framework agents
          </span>
          <h1 className="text-gradient text-4xl font-semibold tracking-tight sm:text-6xl">
            Describe it. Approve the plan.
            <br className="hidden sm:block" /> Ship the agent.
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            See the plan before a line is written. Read what changed and why, every time.{" "}
            Architect turns a prompt into a deployed agentic app — guided when you need it, raw code when you want it.
          </p>
          <HeroPrompt />
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-8">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { value: "11", label: "ready-to-use templates" },
              { value: "~2 min", label: "from idea to live preview" },
              { value: "6+", label: "agent frameworks supported" },
              { value: "Free", label: "to start — no card needed" },
            ].map(({ value, label }) => (
              <div key={label} className="rounded-xl border bg-card/60 p-4 text-center">
                <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl px-4 pb-24 sm:px-8">
          <div className="grid gap-4 md:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <div key={title} className="rounded-xl border bg-card/60 p-5">
                <div className="mb-4 flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary"><Icon className="size-4" /></span>
                  <span className="text-xs text-muted-foreground">Step {i + 1}</span>
                </div>
                <p className="font-medium">{title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="modes" className="mx-auto max-w-6xl space-y-8 px-4 pb-24 sm:px-8">
          <div className="space-y-2 text-center">
            <h2 className="text-3xl font-semibold tracking-tight">One project. Two ways to work.</h2>
            <p className="text-muted-foreground">Technical skill is a dial, not a label — flip it per project, any time.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              {
                icon: Wand2,
                name: "Guided",
                who: "For ops, founders & business teams",
                points: ["Start from goals and templates", "Plain-English plans to approve", "Visual agent builder with friendly terms", "Click-to-edit preview, one-click deploy"],
                tint: "from-emerald-500/15",
              },
              {
                icon: Code2,
                name: "Pro",
                who: "For engineers & ML teams",
                points: ["Import any GitHub repo", "Choose your agent framework", "Code editor, diffs, env vars & secrets", "Pull requests, step-by-step traces & usage"],
                tint: "from-primary/20",
              },
            ].map((m) => (
              <div key={m.name} className={cn("rounded-2xl border bg-gradient-to-br to-transparent p-6", m.tint)}>
                <div className="flex items-center gap-2">
                  <m.icon className="size-5" />
                  <p className="text-xl font-semibold">{m.name}</p>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{m.who}</p>
                <ul className="mt-5 space-y-2.5 text-sm">
                  {m.points.map((p) => (
                    <li key={p} className="flex items-center gap-2"><Check className="size-4 text-primary" /> {p}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl px-4 pb-24 sm:px-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-xl border bg-card/60 p-5">
                <Icon className="mb-3 size-5 text-primary" />
                <p className="font-medium">{title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-8">
          <div className="rounded-2xl border bg-card/60 p-8">
            <div className="mb-6 flex items-center gap-2">
              <Ban className="size-4 text-muted-foreground" />
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">What Architect is not</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {NOT_LIST.map(({ title, body }) => (
                <div key={title} className="rounded-xl border bg-background/50 p-4">
                  <p className="font-medium text-sm">{title}</p>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 pb-24 text-center">
          <div className="glow rounded-2xl border bg-card/70 px-6 py-12">
            <h2 className="text-3xl font-semibold tracking-tight">Your first agent is five minutes away.</h2>
            <p className="mt-2 text-muted-foreground">Free to start. No credit card.</p>
            <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "mt-6 h-10 px-5")}>
              Start building <ArrowRight />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t py-8 text-center text-xs text-muted-foreground">
        Architect 2.0 — build and deploy AI agents without writing a line of code.
      </footer>
    </div>
  );
}
