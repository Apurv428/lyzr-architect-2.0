"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowRight,
  Bot,
  Clock,
  Copy,
  Download,
  Globe,
  LayoutTemplate,
  Search,
  Star,
  Store,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Blueprint = {
  id: string;
  name: string;
  description: string;
  category: string;
  author: string;
  stars: number;
  clones: number;
  framework: string;
  tags: string[];
  featured?: boolean;
  new?: boolean;
};

const CATEGORIES = ["All", "Support", "Sales", "HR", "Knowledge", "Finance", "Productivity", "Marketing", "Research", "DevOps"] as const;

const BLUEPRINTS: Blueprint[] = [
  {
    id: "1",
    name: "Support ticket triage",
    description: "Classifies incoming tickets, drafts replies, and routes to the right team. Connects to Freshdesk, Jira and Slack.",
    category: "Support",
    author: "Lyzr",
    stars: 2840,
    clones: 1240,
    framework: "Lyzr ADK",
    tags: ["slack", "freshdesk", "jira"],
    featured: true,
  },
  {
    id: "2",
    name: "Sales lead qualifier",
    description: "Scores inbound leads against your ICP, enriches with Apollo data, and drafts personalised outreach.",
    category: "Sales",
    author: "Lyzr",
    stars: 1920,
    clones: 890,
    framework: "LangGraph",
    tags: ["apollo", "hubspot", "gmail"],
    featured: true,
  },
  {
    id: "3",
    name: "HR onboarding buddy",
    description: "Answers new-joiner questions from your handbook, tracks onboarding tasks, and escalates gaps to HR.",
    category: "HR",
    author: "Lyzr",
    stars: 1540,
    clones: 670,
    framework: "Lyzr ADK",
    tags: ["notion", "slack", "google-docs"],
  },
  {
    id: "4",
    name: "Document Q&A (RAG)",
    description: "Upload PDFs and ask questions. The agent answers with citations to the exact page it used.",
    category: "Knowledge",
    author: "Lyzr",
    stars: 3210,
    clones: 1890,
    framework: "Lyzr ADK",
    tags: ["rag", "knowledge-base"],
    featured: true,
  },
  {
    id: "5",
    name: "Invoice extractor",
    description: "Pulls line items from invoice PDFs, flags anomalies, and exports a clean CSV to Google Sheets.",
    category: "Finance",
    author: "Lyzr",
    stars: 980,
    clones: 430,
    framework: "Claude Agent SDK",
    tags: ["google-sheets", "pdf"],
  },
  {
    id: "6",
    name: "Meeting summarizer",
    description: "Takes a transcript, extracts decisions and action items with owners, and posts to Slack.",
    category: "Productivity",
    author: "Lyzr",
    stars: 2100,
    clones: 1020,
    framework: "Lyzr ADK",
    tags: ["slack", "google-calendar"],
  },
  {
    id: "7",
    name: "Research assistant",
    description: "Searches the web, synthesises findings into a structured report with citations and open questions.",
    category: "Research",
    author: "community",
    stars: 1340,
    clones: 590,
    framework: "CrewAI",
    tags: ["web-search", "arxiv"],
    new: true,
  },
  {
    id: "8",
    name: "Cold email campaign",
    description: "Generates personalised cold outreach for a lead list, tracks sends, and follows up automatically.",
    category: "Marketing",
    author: "community",
    stars: 760,
    clones: 310,
    framework: "OpenAI Agents SDK",
    tags: ["gmail", "instantly", "apollo"],
    new: true,
  },
  {
    id: "9",
    name: "Data analyst agent",
    description: "Paste CSV data and ask plain-English questions. Produces charts, summaries and anomaly flags.",
    category: "Research",
    author: "Lyzr",
    stars: 1870,
    clones: 840,
    framework: "Lyzr ADK",
    tags: ["google-sheets", "excel"],
  },
  {
    id: "10",
    name: "Code review agent",
    description: "Analyses a GitHub PR diff for bugs, security issues and style problems, posts a structured review.",
    category: "DevOps",
    author: "community",
    stars: 2460,
    clones: 1120,
    framework: "Claude Agent SDK",
    tags: ["github", "linear", "slack"],
    new: true,
  },
  {
    id: "11",
    name: "Social media monitor",
    description: "Tracks brand mentions, classifies sentiment, and surfaces trending topics for your team.",
    category: "Marketing",
    author: "community",
    stars: 540,
    clones: 210,
    framework: "LangGraph",
    tags: ["twitter-x", "linkedin", "slack"],
    new: true,
  },
  {
    id: "12",
    name: "Customer feedback analyser",
    description: "Reads reviews and NPS responses, clusters themes, and posts a weekly digest to Notion.",
    category: "Support",
    author: "Lyzr",
    stars: 1230,
    clones: 480,
    framework: "Lyzr ADK",
    tags: ["notion", "google-sheets"],
  },
];

function BlueprintCard({ bp, onClone }: { bp: Blueprint; onClone: (bp: Blueprint) => void }) {
  return (
    <div className={cn(
      "group flex flex-col rounded-2xl border bg-card/60 p-4 transition hover:border-primary/40 hover:bg-card",
      bp.featured && "border-primary/30 bg-primary/5",
    )}>
      <div className="mb-3 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10">
          <Bot className="size-4.5 text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{bp.name}</p>
            {bp.featured && <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">Featured</span>}
            {bp.new && <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">New</span>}
          </div>
          <p className="text-[11px] text-muted-foreground">{bp.author === "Lyzr" ? "By Lyzr" : "By community"} · {bp.framework}</p>
        </div>
      </div>
      <p className="mb-3 flex-1 text-sm text-muted-foreground">{bp.description}</p>
      <div className="flex flex-wrap gap-1 mb-3">
        {bp.tags.map((t) => (
          <span key={t} className="flex items-center gap-0.5 rounded-md border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            <Tag className="size-2.5" /> {t}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-3 border-t pt-3">
        <span className="flex items-center gap-1 text-xs text-muted-foreground"><Star className="size-3.5" /> {bp.stars.toLocaleString()}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground"><Copy className="size-3.5" /> {bp.clones.toLocaleString()}</span>
        <Button size="sm" className="ml-auto" onClick={() => onClone(bp)}>
          <Download /> Use template
        </Button>
      </div>
    </div>
  );
}

export default function MarketplacePage() {
  const router = useRouter();
  const [category, setCategory] = useState<typeof CATEGORIES[number]>("All");
  const [query, setQuery] = useState("");

  const filtered = BLUEPRINTS.filter((bp) => {
    const matchCat = category === "All" || bp.category === category;
    const matchQ = !query || bp.name.toLowerCase().includes(query.toLowerCase()) || bp.description.toLowerCase().includes(query.toLowerCase()) || bp.tags.some((t) => t.includes(query.toLowerCase()));
    return matchCat && matchQ;
  });

  function clone(bp: Blueprint) {
    router.push(`/dashboard?prompt=${encodeURIComponent(bp.description)}`);
  }

  return (
    <div className="min-h-dvh">
      {/* Hero */}
      <div className="border-b bg-gradient-to-b from-primary/5 to-transparent px-6 py-10 sm:px-10">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Store className="size-4" /> Marketplace
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
              Preview · sample listings
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Ready-to-use agent blueprints</h1>
          <p className="max-w-xl text-muted-foreground">
            Start from a production-grade blueprint built by Lyzr or the community. Clone it, customise it with AI, and deploy in minutes.
          </p>
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48 max-w-sm">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search blueprints…"
                className="h-9 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Globe className="size-4" /> {BLUEPRINTS.length} blueprints · stars and clone counts are sample data until community publishing opens
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8 sm:px-10">
        {/* Category filter */}
        <div className="mb-6 flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition",
                category === cat ? "bg-primary text-primary-foreground" : "border bg-muted/40 text-muted-foreground hover:text-foreground",
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Stats row */}
        <div className="mb-6 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5"><LayoutTemplate className="size-4" /> {filtered.length} results</span>
          <span className="flex items-center gap-1.5"><Clock className="size-4" /> Updated daily</span>
          <Link href="/dashboard" className="ml-auto flex items-center gap-1 text-primary hover:underline text-sm">
            Submit your blueprint <ArrowRight className="size-3.5" />
          </Link>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center text-muted-foreground">
            <Search className="size-10 opacity-30" />
            <p className="font-medium">No blueprints match &ldquo;{query}&rdquo;</p>
            <Button variant="outline" onClick={() => { setQuery(""); setCategory("All"); }}>Clear filters</Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((bp) => (
              <BlueprintCard key={bp.id} bp={bp} onClone={clone} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
