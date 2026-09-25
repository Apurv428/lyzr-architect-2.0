// Deterministic fallback used when no Anthropic credentials are configured,
// so the full plan → build → edit flow is always demoable.
import type { Plan, Questions, WriteFiles } from "./schema";

const TEMPLATE_PLANS: Record<string, Omit<Plan, "assumptions">> = {
  "support-triage": {
    summary: "A support desk where an AI agent classifies incoming tickets, sets urgency and drafts replies for your team to approve.",
    screens: [
      { name: "Inbox", purpose: "All tickets with category, urgency and status at a glance" },
      { name: "Ticket detail", purpose: "Customer message, the agent's reasoning and a draft reply" },
      { name: "Insights", purpose: "Volume by category and response-time trends" },
    ],
    data: [
      { entity: "Ticket", fields: ["customer", "subject", "message", "category", "urgency", "status"] },
      { entity: "Reply draft", fields: ["ticket", "text", "confidence"] },
    ],
    agent: {
      name: "Triage Agent",
      goal: "Route every ticket to the right queue with a ready-to-send reply",
      steps: ["Read the ticket", "Classify category & urgency", "Search help docs", "Draft a reply"],
      tools: ["Knowledge base", "Ticket classifier", "Email draft"],
    },
    rules: ["Never promise refunds", "Escalate legal or security issues to a human", "Hide card numbers and personal data"],
    integrations: ["Email inbox", "Slack alerts"],
  },
};

function genericPlan(prompt: string, name: string): Omit<Plan, "assumptions"> {
  return {
    summary: `${name}: ${prompt.length > 140 ? prompt.slice(0, 137) + "…" : prompt}`,
    screens: [
      { name: "Home", purpose: "Overview of recent activity and key numbers" },
      { name: "Workspace", purpose: "Where you give the agent a task and review its work" },
      { name: "History", purpose: "Everything the agent has done, searchable" },
    ],
    data: [
      { entity: "Task", fields: ["title", "input", "status", "result", "created"] },
      { entity: "Run step", fields: ["task", "step", "output", "duration"] },
    ],
    agent: {
      name: `${name} Agent`,
      goal: "Complete each task end to end and explain what it did",
      steps: ["Understand the request", "Gather the information it needs", "Do the work", "Summarise the result"],
      tools: ["Knowledge base", "Web search", "Notifications"],
    },
    rules: ["Ask for confirmation before sending anything externally", "Cite sources for facts", "Redact personal data"],
    integrations: ["Slack", "Email"],
  };
}

export function demoPlan(prompt: string, name: string, templateId: string | null): Plan {
  const base = (templateId && TEMPLATE_PLANS[templateId]) || genericPlan(prompt, name);
  return {
    ...base,
    assumptions: [
      "Sample data is used until you connect a real source",
      "Your team reviews the agent's output before anything is sent",
    ],
  };
}

export const DEMO_QUESTIONS: Questions = {
  intro: "A few quick questions so the plan fits how you work:",
  questions: [
    { id: "users", question: "Who will use it?", options: ["My team", "Our customers", "Just me"], allow_other: true },
    { id: "source", question: "Where does the information come from?", options: ["Email", "A spreadsheet or CSV", "Another app (Slack, HubSpot…)", "People type it in"], allow_other: true },
    { id: "outcome", question: "What should happen with the results?", options: ["Show them on a dashboard", "Send a notification", "Draft a reply for review"], allow_other: true },
  ],
};

export function demoIntro(mode: "guided" | "pro") {
  return mode === "guided"
    ? "Great idea! Here's how I'd build it — take a look, tweak anything, then approve and I'll start."
    : "Here's the proposed architecture. Review the screens, data model and agent pipeline, then approve to generate the code.";
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

export function demoBuild(plan: Plan, name: string, accent = "indigo"): WriteFiles {
  const screens = plan.screens.map((s) => s.name);
  const entity = plan.data[0]?.entity ?? "Item";
  const steps = plan.agent.steps;

  const data = `export type Row = { id: number; title: string; owner: string; status: "New" | "In progress" | "Done"; score: number };

export const ROWS: Row[] = [
  { id: 1041, title: "Refund request for order #8812", owner: "Priya", status: "New", score: 92 },
  { id: 1040, title: "Can't log in after password reset", owner: "Arjun", status: "In progress", score: 81 },
  { id: 1039, title: "Question about annual pricing", owner: "Meera", status: "Done", score: 64 },
  { id: 1038, title: "Integration with HubSpot failing", owner: "Priya", status: "In progress", score: 88 },
  { id: 1037, title: "Feature request: dark mode", owner: "Rahul", status: "New", score: 42 },
];

export const AGENT_STEPS = ${JSON.stringify(steps)};
`;

  const agent = `import { useState } from "react";
import { Bot, Check, Loader2, Play } from "lucide-react";
import { AGENT_STEPS } from "../lib/data";

export default function AgentPanel() {
  const [input, setInput] = useState("");
  const [step, setStep] = useState(-1);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    if (!input.trim()) return;
    setResult(null);
    for (let i = 0; i < AGENT_STEPS.length; i++) {
      setStep(i);
      await new Promise((r) => setTimeout(r, 700));
    }
    setStep(AGENT_STEPS.length);
    setResult(\`Done — handled “\${input.trim()}” and saved the result to History.\`);
  }

  const running = step >= 0 && step < AGENT_STEPS.length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-${accent}-100 text-${accent}-600"><Bot size={16} /></div>
        <div>
          <p className="text-sm font-semibold text-slate-900">${esc(plan.agent.name)}</p>
          <p className="text-xs text-slate-500">${esc(plan.agent.goal)}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="Give the agent a task…"
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-${accent}-400"
        />
        <button onClick={run} disabled={running} className="inline-flex items-center gap-1.5 rounded-lg bg-${accent}-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
          {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Run
        </button>
      </div>
      {step >= 0 && (
        <ol className="mt-4 space-y-2">
          {AGENT_STEPS.map((s: string, i: number) => (
            <li key={s} className="flex items-center gap-2 text-sm">
              {i < step ? <Check size={14} className="text-emerald-500" /> : i === step ? <Loader2 size={14} className="animate-spin text-${accent}-500" /> : <span className="h-3.5 w-3.5 rounded-full border border-slate-300" />}
              <span className={i <= step ? "text-slate-800" : "text-slate-400"}>{s}</span>
            </li>
          ))}
        </ol>
      )}
      {result && <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{result}</p>}
    </div>
  );
}
`;

  const app = `import { useState } from "react";
import { LayoutDashboard, Search, Sparkles } from "lucide-react";
import AgentPanel from "./components/AgentPanel";
import { ROWS } from "./lib/data";

const SCREENS = ${JSON.stringify(screens)};
const STATUS: Record<string, string> = {
  New: "bg-sky-50 text-sky-700",
  "In progress": "bg-amber-50 text-amber-700",
  Done: "bg-emerald-50 text-emerald-700",
};

export default function App() {
  const [screen, setScreen] = useState(SCREENS[0]);
  const [query, setQuery] = useState("");
  const rows = ROWS.filter((r) => r.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900">
      <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white p-4 md:block">
        <div className="mb-6 flex items-center gap-2 font-semibold">
          <Sparkles size={18} className="text-${accent}-600" /> ${esc(name)}
        </div>
        <nav className="space-y-1">
          {SCREENS.map((s) => (
            <button key={s} onClick={() => setScreen(s)}
              className={\`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm \${screen === s ? "bg-${accent}-50 font-medium text-${accent}-700" : "text-slate-600 hover:bg-slate-100"}\`}>
              <LayoutDashboard size={15} /> {s}
            </button>
          ))}
        </nav>
      </aside>
      <main className="flex-1 space-y-6 p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{screen}</h1>
            <p className="text-sm text-slate-500">${esc(plan.summary)}</p>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <Search size={14} className="text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ${esc(entity.toLowerCase())}s…" className="outline-none" />
          </label>
        </header>
        <section className="grid gap-4 sm:grid-cols-3">
          {[["Open", 18], ["Handled by agent", "74%"], ["Avg. response", "3m"]].map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">{k}</p>
              <p className="mt-1 text-2xl font-semibold">{v}</p>
            </div>
          ))}
        </section>
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr><th className="px-4 py-2">${esc(entity)}</th><th className="px-4 py-2">Owner</th><th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">Score</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-3"><span className="text-slate-400">#{r.id}</span> {r.title}</td>
                    <td className="px-4 py-3 text-slate-600">{r.owner}</td>
                    <td className="px-4 py-3"><span className={\`rounded-full px-2 py-0.5 text-xs \${STATUS[r.status]}\`}>{r.status}</span></td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.score}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">Nothing matches “{query}”</td></tr>}
              </tbody>
            </table>
          </section>
          <AgentPanel />
        </div>
      </main>
    </div>
  );
}
`;

  return {
    checkpoint_label: "Initial app build",
    summary: [
      `Built ${screens.length} screens: ${screens.join(", ")}`,
      `Added the ${plan.agent.name} with a live step-by-step run view`,
      `Seeded sample ${entity.toLowerCase()} data so you can try it right away`,
    ],
    files: [
      { path: "/App.tsx", content: app },
      { path: "/components/AgentPanel.tsx", content: agent },
      { path: "/lib/data.ts", content: data },
    ],
    next_suggestions: ["Add a filter by status", "Make the accent colour green", "Add a detail view for each row"],
  };
}

export function demoEdit(input: string, files: Record<string, string>): WriteFiles | null {
  const app = files["/App.tsx"];
  if (!app) return null;
  const colour = input.toLowerCase().match(/\b(green|emerald|blue|sky|violet|purple|rose|pink|orange|amber|teal|indigo)\b/)?.[1];
  if (colour) {
    const target = colour === "green" ? "emerald" : colour === "purple" ? "violet" : colour === "pink" ? "rose" : colour;
    const recolour = (s: string) => s.replace(/\b(indigo|emerald|sky|violet|rose|orange|amber|teal|blue)-(\d{2,3})\b/g, `${target}-$2`);
    return {
      checkpoint_label: `Switch accent to ${colour}`,
      summary: [`Changed the accent colour to ${colour} across the navigation, buttons and agent panel`],
      files: Object.entries(files)
        .filter(([p]) => p.endsWith(".tsx"))
        .map(([path, content]) => ({ path, content: recolour(content) })),
      next_suggestions: ["Add a filter by status", "Add a detail view for each row"],
    };
  }
  return null;
}
