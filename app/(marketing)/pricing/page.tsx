import Link from "next/link";
import { Check } from "lucide-react";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    name: "Free",
    price: "₹0",
    note: "forever",
    blurb: "For trying ideas",
    cta: "Start free",
    features: ["100 AI credits / day", "3 projects", "Public deploys on architect.app", "Guided & Pro modes", "Community support"],
  },
  {
    name: "Pro",
    price: "₹1,599",
    note: "per month",
    blurb: "For builders shipping real apps",
    cta: "Go Pro",
    highlight: true,
    features: ["2,000 AI credits / month", "Unlimited projects", "Custom domains", "GitHub import, branches & PRs", "Agent API + usage analytics", "Bring your own model keys"],
  },
  {
    name: "Team",
    price: "₹3,999",
    note: "per seat / month",
    blurb: "For teams building together",
    cta: "Start a team",
    features: ["Everything in Pro", "Shared workspaces & roles", "Evals & trace history", "Private deploys with SSO", "Priority support"],
  },
  {
    name: "Enterprise",
    price: "Custom",
    note: "",
    blurb: "For regulated, at-scale orgs",
    cta: "Talk to us",
    features: ["Lyzr Responsible AI suite", "VPC / on-prem deployment", "Audit logs & data residency", "SOC 2, ISO 27001", "Dedicated solutions architect"],
  },
];

export default function PricingPage() {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div className="pointer-events-none absolute -top-60 left-1/2 size-[800px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      <header className="relative mx-auto flex max-w-6xl items-center px-4 py-5 sm:px-8">
        <Logo />
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className={buttonVariants({ variant: "ghost" })}>Sign in</Link>
          <Link href="/signup" className={buttonVariants()}>Get started</Link>
        </div>
      </header>
      <main className="relative mx-auto max-w-6xl space-y-12 px-4 py-16 sm:px-8">
        <div className="space-y-3 text-center">
          <h1 className="text-gradient text-4xl font-semibold tracking-tight">Simple pricing that grows with you</h1>
          <p className="text-muted-foreground">Start free. Upgrade when your agents go to work.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((p) => (
            <div key={p.name} className={cn("flex flex-col rounded-2xl border bg-card/70 p-6", p.highlight && "glow border-primary/60")}>
              <div className="flex items-center gap-2">
                <p className="font-semibold">{p.name}</p>
                {p.highlight && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">Most popular</span>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{p.blurb}</p>
              <p className="mt-5 text-3xl font-semibold">
                {p.price} <span className="text-sm font-normal text-muted-foreground">{p.note}</span>
              </p>
              <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" /> {f}</li>
                ))}
              </ul>
              <Link href="/signup" className={cn(buttonVariants({ variant: p.highlight ? "default" : "outline", size: "lg" }), "mt-6 h-10")}>
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground">Prices are illustrative for this concept build.</p>
      </main>
    </div>
  );
}
