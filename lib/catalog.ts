import type { LucideIcon } from "lucide-react";
import {
  BookOpenText,
  Briefcase,
  Code2,
  Database,
  FileText,
  Headset,
  Mic,
  Palette,
  Target,
  UserPlus,
} from "lucide-react";

export type Template = {
  id: string;
  name: string;
  tagline: string;
  category: "Support" | "Sales" | "HR" | "Knowledge" | "Finance" | "Productivity";
  icon: LucideIcon;
  prompt: string;
  accent: string; // tailwind gradient classes
};

export const TEMPLATES: Template[] = [
  {
    id: "support-triage",
    name: "Support ticket triage",
    tagline: "Classify, prioritise and route tickets with a live dashboard",
    category: "Support",
    icon: Headset,
    prompt:
      "Build a support ticket triage agent that reads incoming tickets, classifies them by category and urgency, drafts a reply, and shows everything on a dashboard my team can filter.",
    accent: "from-sky-500/25 to-indigo-500/10",
  },
  {
    id: "lead-qualifier",
    name: "Sales lead qualifier",
    tagline: "Score inbound leads and draft personalised outreach",
    category: "Sales",
    icon: Target,
    prompt:
      "Build a lead qualification agent that enriches inbound leads, scores them against our ideal customer profile, and drafts a personalised first email for the top leads.",
    accent: "from-emerald-500/25 to-teal-500/10",
  },
  {
    id: "hr-onboarding",
    name: "HR onboarding buddy",
    tagline: "Answer new-joiner questions from your handbook",
    category: "HR",
    icon: UserPlus,
    prompt:
      "Build an onboarding assistant for new employees that answers questions from our HR handbook, tracks their onboarding checklist, and escalates anything it can't answer to HR.",
    accent: "from-amber-500/25 to-orange-500/10",
  },
  {
    id: "doc-qa",
    name: "Docs Q&A (RAG)",
    tagline: "Chat with your PDFs and wikis, with citations",
    category: "Knowledge",
    icon: BookOpenText,
    prompt:
      "Build a document Q&A app where I upload PDFs and the agent answers questions with citations to the exact page it used.",
    accent: "from-violet-500/25 to-fuchsia-500/10",
  },
  {
    id: "invoice-extractor",
    name: "Invoice extractor",
    tagline: "Pull line items from invoices into a clean table",
    category: "Finance",
    icon: FileText,
    prompt:
      "Build an invoice processing agent that extracts vendor, dates, totals and line items from uploaded invoices, flags anomalies, and exports to CSV.",
    accent: "from-rose-500/25 to-pink-500/10",
  },
  {
    id: "meeting-summarizer",
    name: "Meeting summarizer",
    tagline: "Turn transcripts into decisions and action items",
    category: "Productivity",
    icon: Mic,
    prompt:
      "Build a meeting summarizer that takes a transcript, extracts decisions and action items with owners, and posts a summary to Slack.",
    accent: "from-cyan-500/25 to-blue-500/10",
  },
];

export const FRAMEWORKS = [
  { id: "lyzr-adk", name: "Lyzr ADK" },
  { id: "langgraph", name: "LangGraph" },
  { id: "crewai", name: "CrewAI" },
  { id: "openai-agents", name: "OpenAI Agents SDK" },
  { id: "claude-agent-sdk", name: "Claude Agent SDK" },
  { id: "google-adk", name: "Google ADK" },
] as const;

export const ROLES = [
  { id: "founder", label: "Founder / PM", icon: Briefcase, hint: "I have an idea to ship" },
  { id: "ops", label: "Ops / Business", icon: Target, hint: "I want to automate work" },
  { id: "designer", label: "Designer", icon: Palette, hint: "I care how it looks" },
  { id: "developer", label: "Developer", icon: Code2, hint: "I write code daily" },
  { id: "data", label: "Data / ML", icon: Database, hint: "I build models & pipelines" },
] as const;

export function getTemplate(id: string | null | undefined) {
  return TEMPLATES.find((t) => t.id === id);
}
