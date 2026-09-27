#!/usr/bin/env node
/**
 * Seed the demo account with 3 polished projects so reviewers see a populated
 * dashboard immediately after login.
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   DEMO_USER_EMAIL=demo@example.com \
 *   node scripts/seed-demo.mjs
 *
 * The script is idempotent: re-running it deletes any projects named exactly
 * the same as the seeded ones and re-creates them, so the demo stays fresh.
 *
 * Requires: @supabase/supabase-js (already in package.json)
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO_USER_EMAIL = process.env.DEMO_USER_EMAIL;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !DEMO_USER_EMAIL) {
  console.error(
    "Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, and DEMO_USER_EMAIL.",
  );
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── helpers ────────────────────────────────────────────────────────────────

function uuid() {
  return crypto.randomUUID();
}

function ago(days, hours = 0) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - hours);
  return d.toISOString();
}

async function run(label, fn) {
  process.stdout.write(`  ${label}… `);
  await fn();
  console.log("✓");
}

// ─── demo apps (React + Tailwind, runs in Sandpack) ──────────────────────────

const SUPPORT_APP = `
import { useState } from "react";

const TICKETS = [
  { id: "TKT-001", subject: "Login not working", priority: "High", status: "Open", category: "Auth" },
  { id: "TKT-002", subject: "Export to CSV is slow", priority: "Medium", status: "In Progress", category: "Performance" },
  { id: "TKT-003", subject: "Dark mode contrast issue", priority: "Low", status: "Open", category: "UI" },
  { id: "TKT-004", subject: "API rate limit hit at 3 am", priority: "High", status: "Resolved", category: "API" },
  { id: "TKT-005", subject: "Mobile app crash on iOS 17", priority: "Critical", status: "Open", category: "Mobile" },
];

const PRIORITY_COLOR = {
  Critical: "bg-red-100 text-red-700",
  High: "bg-orange-100 text-orange-700",
  Medium: "bg-yellow-100 text-yellow-700",
  Low: "bg-slate-100 text-slate-600",
};

const STATUS_COLOR = {
  Open: "bg-blue-100 text-blue-700",
  "In Progress": "bg-purple-100 text-purple-700",
  Resolved: "bg-green-100 text-green-700",
};

export default function App() {
  const [filter, setFilter] = useState("All");
  const categories = ["All", ...new Set(TICKETS.map((t) => t.category))];
  const visible = filter === "All" ? TICKETS : TICKETS.filter((t) => t.category === filter);
  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Support Tickets</h1>
            <p className="text-sm text-slate-500">{TICKETS.filter(t=>t.status!=="Resolved").length} open · {TICKETS.filter(t=>t.status==="Resolved").length} resolved</p>
          </div>
          <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">New ticket</button>
        </div>
        <div className="mb-4 flex gap-2">
          {categories.map((c) => (
            <button key={c} onClick={() => setFilter(c)}
              className={\`rounded-full px-3 py-1 text-xs font-medium transition \${filter===c ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border hover:bg-slate-50"}\`}>
              {c}
            </button>
          ))}
        </div>
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          {visible.map((t, i) => (
            <div key={t.id} className={\`flex items-center gap-4 px-4 py-3.5 \${i!==0 ? "border-t" : ""} hover:bg-slate-50\`}>
              <span className="w-20 font-mono text-xs text-slate-400">{t.id}</span>
              <span className="flex-1 text-sm font-medium text-slate-800">{t.subject}</span>
              <span className={\`rounded-full px-2 py-0.5 text-xs font-medium \${PRIORITY_COLOR[t.priority]}\`}>{t.priority}</span>
              <span className={\`rounded-full px-2 py-0.5 text-xs font-medium \${STATUS_COLOR[t.status]}\`}>{t.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
`.trim();

const LEADS_APP = `
import { useState } from "react";

const LEADS = [
  { id: 1, name: "Priya Sharma", company: "Acme Corp", score: 92, stage: "Demo Scheduled", value: "$18k" },
  { id: 2, name: "James Liu", company: "Bright Health", score: 78, stage: "Proposal Sent", value: "$42k" },
  { id: 3, name: "Sara Osei", company: "Nova Fintech", score: 65, stage: "Contacted", value: "$9k" },
  { id: 4, name: "Raj Patel", company: "EduFlow", score: 88, stage: "Negotiation", value: "$31k" },
  { id: 5, name: "Ana Flores", company: "ShipFast", score: 45, stage: "New Lead", value: "$6k" },
];

const STAGE_COLOR = {
  "New Lead": "bg-slate-100 text-slate-600",
  Contacted: "bg-blue-100 text-blue-700",
  "Demo Scheduled": "bg-indigo-100 text-indigo-700",
  "Proposal Sent": "bg-yellow-100 text-yellow-700",
  Negotiation: "bg-orange-100 text-orange-700",
  Closed: "bg-green-100 text-green-700",
};

function ScoreBar({ score }) {
  const color = score >= 80 ? "bg-green-500" : score >= 60 ? "bg-yellow-500" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
        <div className={\`h-full rounded-full \${color}\`} style={{width:\`\${score}%\`}} />
      </div>
      <span className="text-xs font-medium tabular-nums text-slate-700">{score}</span>
    </div>
  );
}

export default function App() {
  const [sort, setSort] = useState("score");
  const sorted = [...LEADS].sort((a,b) => sort==="score" ? b.score-a.score : a.name.localeCompare(b.name));
  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Lead Qualifier</h1>
            <p className="text-sm text-slate-500">AI-scored · {LEADS.length} leads · {LEADS.filter(l=>l.score>=80).length} hot</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setSort("score")} className={\`rounded-lg px-3 py-1.5 text-xs font-medium \${sort==="score"?"bg-indigo-600 text-white":"bg-white border text-slate-600"}\`}>By score</button>
            <button onClick={() => setSort("name")} className={\`rounded-lg px-3 py-1.5 text-xs font-medium \${sort==="name"?"bg-indigo-600 text-white":"bg-white border text-slate-600"}\`}>A → Z</button>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          {sorted.map((l, i) => (
            <div key={l.id} className={\`flex items-center gap-4 px-4 py-3.5 \${i!==0?"border-t":""} hover:bg-slate-50\`}>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">{l.name}</p>
                <p className="text-xs text-slate-500">{l.company}</p>
              </div>
              <ScoreBar score={l.score} />
              <span className="w-24 text-right text-xs font-medium text-slate-700">{l.value}</span>
              <span className={\`rounded-full px-2 py-0.5 text-xs font-medium \${STAGE_COLOR[l.stage]}\`}>{l.stage}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
`.trim();

const DOCQA_APP = `
import { useState } from "react";

const SOURCES = [
  { title: "Returns Policy", page: 3, excerpt: "Customers may return any item within 30 days of purchase for a full refund, provided the item is unused and in its original packaging." },
  { title: "Shipping Guide", page: 1, excerpt: "Standard shipping takes 3–5 business days. Express shipping (1–2 days) is available for an additional $12.99." },
  { title: "FAQ", page: 7, excerpt: "To reset your password, click 'Forgot password' on the login screen and follow the emailed link. Links expire after 24 hours." },
];

const HISTORY = [
  { role: "user", text: "How long do I have to return a product?" },
  { role: "assistant", text: "You have 30 days from the date of purchase to return any item for a full refund. The item must be unused and in its original packaging.", source: SOURCES[0] },
  { role: "user", text: "How fast is express shipping?" },
  { role: "assistant", text: "Express shipping delivers in 1–2 business days for an additional $12.99.", source: SOURCES[1] },
];

export default function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState(HISTORY);
  function send() {
    if (!input.trim()) return;
    setMessages(m => [...m,
      { role: "user", text: input },
      { role: "assistant", text: "Let me check the documentation for you…", source: null },
    ]);
    setInput("");
  }
  return (
    <div className="flex h-screen flex-col bg-slate-50 font-sans">
      <div className="border-b bg-white px-4 py-3 shadow-sm">
        <h1 className="text-base font-semibold text-slate-900">Document Q&A</h1>
        <p className="text-xs text-slate-500">3 documents · 24 pages indexed</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={\`flex \${m.role==="user"?"justify-end":"justify-start"}\`}>
            <div className={\`max-w-sm rounded-2xl px-4 py-2.5 text-sm \${m.role==="user"?"bg-indigo-600 text-white":"bg-white border text-slate-800 shadow-sm"}\`}>
              {m.text}
              {m.source && (
                <p className="mt-1.5 text-[11px] text-slate-400">
                  📄 {m.source.title}, p.{m.source.page}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t bg-white p-3">
        <div className="flex gap-2">
          <input value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&send()}
            placeholder="Ask anything about your docs…"
            className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-indigo-400" />
          <button onClick={send} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Send</button>
        </div>
      </div>
    </div>
  );
}
`.trim();

// ─── agent graphs ─────────────────────────────────────────────────────────────

function makeGraph(name, toolId, instructions) {
  const trigger = { id: "trigger-1", type: "agent", position: { x: 260, y: 0 }, data: { kind: "trigger", label: "Incoming request", config: { source: "Chat" } } };
  const llm = { id: "llm-1", type: "agent", position: { x: 260, y: 130 }, data: { kind: "llm", label: `${name} Agent`, config: { model: "claude-opus-5", instructions, temperature: 0.3 } } };
  const tool = { id: "tool-1", type: "agent", position: { x: 80, y: 290 }, data: { kind: "tool", label: toolId === "web_search" ? "Web search" : toolId === "slack_message" ? "Post to Slack" : "Search docs", config: { tool: toolId } } };
  const knowledge = { id: "knowledge-1", type: "agent", position: { x: 540, y: 0 }, data: { kind: "knowledge", label: "Help docs", config: { content: "", files: [] } } };
  const guardrail = { id: "guard-1", type: "agent", position: { x: 260, y: 430 }, data: { kind: "guardrail", label: "Safety rules", config: { rules: ["Never share personal data", "Always cite sources"], redactPII: true } } };
  const output = { id: "output-1", type: "agent", position: { x: 260, y: 560 }, data: { kind: "output", label: "Reply", config: { format: "Markdown" } } };
  const edges = [
    { id: "e1", source: "trigger-1", target: "llm-1" },
    { id: "e2", source: "knowledge-1", target: "llm-1" },
    { id: "e3", source: "llm-1", target: "tool-1" },
    { id: "e4", source: "tool-1", target: "guard-1" },
    { id: "e5", source: "guard-1", target: "output-1" },
  ];
  return { nodes: [trigger, llm, tool, knowledge, guardrail, output], edges };
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🌱 Seeding demo account…\n");

  // 1. Resolve the demo user's ID.
  const { data: { users }, error: listErr } = await sb.auth.admin.listUsers();
  if (listErr) { console.error("Could not list users:", listErr.message); process.exit(1); }
  const user = users.find((u) => u.email === DEMO_USER_EMAIL);
  if (!user) {
    console.error(`No user found with email "${DEMO_USER_EMAIL}". Sign up first, then run this script.`);
    process.exit(1);
  }
  const userId = user.id;
  console.log(`  User: ${DEMO_USER_EMAIL} (${userId})\n`);

  // 2. Ensure the profile exists and is onboarded.
  await run("Upsert profile", async () => {
    await sb.from("profiles").upsert({
      id: userId,
      full_name: "Demo User",
      role: "Founder",
      experience_level: 3,
      default_mode: "guided",
      onboarded: true,
      credits: 100,
    }, { onConflict: "id" });
  });

  // 3. Delete any existing seeded projects (idempotent).
  const SEED_NAMES = ["Support Ticket Triage", "Sales Lead Qualifier", "Document Q&A Bot"];
  await run("Remove stale seed projects", async () => {
    await sb.from("projects").delete().in("name", SEED_NAMES).eq("owner_id", userId);
  });

  // ── Project 1: Support Ticket Triage (deployed, guided) ──────────────────
  console.log("\n📦 Project 1: Support Ticket Triage (deployed)");
  const p1Id = uuid();
  const p1CheckpointId = uuid();
  const p1DeploySlug = `support-triage-${p1Id.slice(0, 8)}`;
  const p1AgentId = uuid();
  const p1MsgPlanId = uuid();
  const p1MsgBuildId = uuid();

  await run("Create project", async () => {
    await sb.from("projects").insert({
      id: p1Id,
      owner_id: userId,
      name: "Support Ticket Triage",
      description: "An AI agent that categorises and routes incoming support tickets by priority.",
      prompt: "Build me a support ticket triage dashboard with priority levels and status tracking",
      mode: "guided",
      template_id: "support-triage",
      status: "deployed",
      created_at: ago(3),
      updated_at: ago(1),
    });
  });

  await run("Seed messages", async () => {
    await sb.from("messages").insert([
      {
        id: p1MsgPlanId,
        project_id: p1Id,
        role: "assistant",
        kind: "plan",
        content: "Here's what I'll build:",
        data: {
          summary: "A ticket triage dashboard with priority badges, category filters, and status tracking.",
          screens: [{ name: "Dashboard", purpose: "List all tickets with filters and priority indicators" }],
          data: [{ name: "Ticket", fields: ["id", "subject", "priority", "status", "category"] }],
          agent: { name: "Triage Agent", goal: "Categorise and route tickets automatically", steps: ["Read ticket", "Classify priority", "Assign category", "Notify via Slack"], tools: ["slack_message"], rules: ["Never share customer PII", "Always escalate Critical within 5 min"] },
          rules: ["Keep responses under 3 sentences", "Always include the ticket ID"],
          integrations: ["Slack for notifications"],
          assumptions: ["Tickets arrive via chat; real webhook integration coming in v2"],
        },
        created_at: ago(3, 2),
      },
      {
        id: p1MsgBuildId,
        project_id: p1Id,
        role: "assistant",
        kind: "changes",
        content: "Done! Your dashboard is live in the preview.",
        data: { bullets: ["Built the ticket list with priority colour-coding", "Added category filter chips", "Wired the Triage Agent with Slack notification support"] },
        created_at: ago(3, 1),
      },
    ]);
  });

  await run("Create checkpoint", async () => {
    await sb.from("checkpoints").insert({
      id: p1CheckpointId,
      project_id: p1Id,
      message_id: p1MsgBuildId,
      label: "Initial build",
      files: { "/App.tsx": SUPPORT_APP },
      created_at: ago(3, 1),
    });
  });

  await run("Create deployment", async () => {
    await sb.from("deployments").insert({
      project_id: p1Id,
      owner_id: userId,
      checkpoint_id: p1CheckpointId,
      slug: p1DeploySlug,
      files: { "/App.tsx": SUPPORT_APP },
      env: "production",
      status: "live",
      is_current: true,
      created_at: ago(1),
    });
    // Update project deploy_url.
    await sb.from("projects").update({ deploy_url: `/s/${p1DeploySlug}` }).eq("id", p1Id);
  });

  await run("Create agent", async () => {
    await sb.from("agents").insert({
      id: p1AgentId,
      project_id: p1Id,
      owner_id: userId,
      name: "Triage Agent",
      framework: "lyzr-adk",
      model: "claude-opus-5",
      graph: makeGraph("Triage", "slack_message", "You are a support ticket triage agent. Classify each ticket by priority (Critical/High/Medium/Low) and category, then notify the support team via Slack."),
      created_at: ago(3),
      updated_at: ago(1),
    });
  });

  await run("Seed agent runs", async () => {
    await sb.from("agent_runs").insert([
      {
        agent_id: p1AgentId,
        owner_id: userId,
        input: "New ticket: 'App crashes on checkout' from user@example.com",
        output: "Classified as **Critical** · Category: Checkout · Notified #support-critical on Slack.",
        trace: [
          { type: "text", title: "Thinking", detail: "Analysing ticket content", ms: 320 },
          { type: "tool", title: "Post to Slack", detail: "#support-critical", result: "Message sent", live: false, simulated: true, ms: 180 },
          { type: "text", title: "Reply", detail: "Classified as Critical", ms: 410 },
        ],
        tokens: 312,
        latency_ms: 910,
        source: "console",
        created_at: ago(1, 3),
      },
    ]);
  });

  // ── Project 2: Sales Lead Qualifier (imported repo, pro, with PR) ─────────
  console.log("\n📦 Project 2: Sales Lead Qualifier (GitHub import)");
  const p2Id = uuid();
  const p2CheckpointId = uuid();
  const p2AgentId = uuid();
  const p2MsgPlanId = uuid();
  const p2MsgBuildId = uuid();

  await run("Create project", async () => {
    await sb.from("projects").insert({
      id: p2Id,
      owner_id: userId,
      name: "Sales Lead Qualifier",
      description: "Scores incoming leads 0–100 based on fit, intent signals and company size.",
      prompt: "Add an AI lead scoring agent to my CRM repo",
      mode: "pro",
      framework: "langgraph",
      github_repo: "acme-corp/crm-backend",
      github_branch: "main",
      status: "ready",
      created_at: ago(5),
      updated_at: ago(2),
    });
  });

  await run("Seed messages", async () => {
    await sb.from("messages").insert([
      {
        id: p2MsgPlanId,
        project_id: p2Id,
        role: "assistant",
        kind: "plan",
        content: "Here's the plan for your CRM repo:",
        data: {
          summary: "Add a LangGraph lead-scoring agent. I'll create two new files and update the API routes.",
          screens: [{ name: "Lead dashboard", purpose: "Show scored leads with sortable score bar" }],
          data: [{ name: "Lead", fields: ["name", "company", "score", "stage", "value"] }],
          agent: { name: "Qualifier Agent", goal: "Score leads 0–100 and classify by pipeline stage", steps: ["Fetch lead data", "Enrich with web search", "Score against ICP", "Update CRM record"], tools: ["web_search", "crm_lookup"], rules: ["Score must be 0–100", "Never disclose scoring weights"], framework: "langgraph" },
          rules: [],
          integrations: ["CRM lookup", "Web search for company signals"],
          assumptions: ["Repo uses Python FastAPI; agent scaffold will be added as a new module"],
        },
        created_at: ago(5, 4),
      },
      {
        id: p2MsgBuildId,
        project_id: p2Id,
        role: "assistant",
        kind: "changes",
        content: "Preview updated. PR is ready to open.",
        data: { bullets: ["Generated LangGraph scaffold in /agents/lead_qualifier.py", "Added /leads route with AI score field", "Score bar component added to the dashboard UI"] },
        created_at: ago(5, 2),
      },
    ]);
  });

  await run("Create checkpoint", async () => {
    await sb.from("checkpoints").insert({
      id: p2CheckpointId,
      project_id: p2Id,
      message_id: p2MsgBuildId,
      label: "LangGraph scaffold",
      files: { "/App.tsx": LEADS_APP },
      created_at: ago(5, 2),
    });
  });

  await run("Create agent", async () => {
    await sb.from("agents").insert({
      id: p2AgentId,
      project_id: p2Id,
      owner_id: userId,
      name: "Qualifier Agent",
      framework: "langgraph",
      model: "claude-opus-5",
      graph: makeGraph("Qualifier", "web_search", "You are a B2B lead scoring agent. Score each lead 0–100 based on company size, industry fit and intent signals. Return a JSON object with score, stage and a one-line reason."),
      created_at: ago(5),
      updated_at: ago(2),
    });
  });

  await run("Create deployment (PR)", async () => {
    await sb.from("deployments").insert({
      project_id: p2Id,
      owner_id: userId,
      checkpoint_id: p2CheckpointId,
      slug: `lead-qualifier-${p2Id.slice(0, 8)}`,
      files: { "/App.tsx": LEADS_APP },
      env: "preview",
      status: "live",
      is_current: true,
      commit_sha: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      created_at: ago(2),
    });
  });

  // ── Project 3: Document Q&A Bot (with evals) ──────────────────────────────
  console.log("\n📦 Project 3: Document Q&A Bot (with evals)");
  const p3Id = uuid();
  const p3CheckpointId = uuid();
  const p3AgentId = uuid();
  const p3MsgBuildId = uuid();

  await run("Create project", async () => {
    await sb.from("projects").insert({
      id: p3Id,
      owner_id: userId,
      name: "Document Q&A Bot",
      description: "Chat with your policy documents. Answers cite the source file and page number.",
      prompt: "Build a chatbot that answers questions from my uploaded PDFs",
      mode: "guided",
      template_id: "doc-qa",
      status: "ready",
      created_at: ago(7),
      updated_at: ago(4),
    });
  });

  await run("Seed messages", async () => {
    await sb.from("messages").insert([
      {
        id: p3MsgBuildId,
        project_id: p3Id,
        role: "assistant",
        kind: "changes",
        content: "Your Document Q&A bot is ready. Upload PDFs in the Knowledge block.",
        data: { bullets: ["Built the chat UI with message history", "Knowledge block wired for PDF upload", "Answers cite file name and page number"] },
        created_at: ago(7, 1),
      },
    ]);
  });

  await run("Create checkpoint", async () => {
    await sb.from("checkpoints").insert({
      id: p3CheckpointId,
      project_id: p3Id,
      message_id: p3MsgBuildId,
      label: "Initial build",
      files: { "/App.tsx": DOCQA_APP },
      created_at: ago(7, 1),
    });
  });

  await run("Create agent", async () => {
    await sb.from("agents").insert({
      id: p3AgentId,
      project_id: p3Id,
      owner_id: userId,
      name: "Q&A Agent",
      framework: "lyzr-adk",
      model: "claude-opus-5",
      graph: makeGraph("Q&A", "web_search", "You are a document Q&A assistant. Answer questions using only the provided knowledge base. Always cite the source document name and page number. If the answer is not in the documents, say so clearly."),
      created_at: ago(7),
      updated_at: ago(4),
    });
  });

  await run("Seed eval cases", async () => {
    const cases = [
      { agent_id: p3AgentId, owner_id: userId, input: "How long do I have to return a product?", expectation: "30 days", kind: "contains", created_at: ago(4) },
      { agent_id: p3AgentId, owner_id: userId, input: "Can I get a full refund after 90 days?", expectation: "doesn't promise a refund after 90 days", kind: "judge", created_at: ago(4) },
      { agent_id: p3AgentId, owner_id: userId, input: "How fast is express shipping?", expectation: "1–2", kind: "contains", created_at: ago(4) },
    ];
    const { data: inserted } = await sb.from("eval_cases").insert(cases).select("id");
    if (!inserted) return;
    await sb.from("eval_runs").insert({
      agent_id: p3AgentId,
      owner_id: userId,
      results: inserted.map((c) => ({ case_id: c.id, verdict: "PASS", reason: "Answer matches expectation", ms: 800 + Math.floor(Math.random() * 400) })),
      pass_rate: 1.0,
      created_at: ago(3),
    });
  });

  await run("Seed agent runs", async () => {
    await sb.from("agent_runs").insert([
      {
        agent_id: p3AgentId,
        owner_id: userId,
        input: "What is your return policy?",
        output: "You can return any item within **30 days** of purchase for a full refund, as long as it is unused and in its original packaging. *(Returns Policy, p. 3)*",
        trace: [
          { type: "text", title: "Thinking", detail: "Searching knowledge base", ms: 290 },
          { type: "text", title: "Retrieved", detail: "Returns Policy p.3 · 1 passage", ms: 140 },
          { type: "text", title: "Reply", detail: "30-day return window", ms: 510 },
        ],
        tokens: 278,
        latency_ms: 940,
        source: "console",
        created_at: ago(3, 5),
      },
    ]);
  });

  // ── Events ───────────────────────────────────────────────────────────────
  await run("Seed product events", async () => {
    const events = [
      { user_id: userId, name: "signed_up", props: {}, created_at: ago(7, 6) },
      { user_id: userId, name: "onboarded", props: { mode: "guided" }, created_at: ago(7, 5) },
      { user_id: userId, name: "project_created", props: { source: "template" }, project_id: p1Id, created_at: ago(3, 2) },
      { user_id: userId, name: "plan_proposed", props: {}, project_id: p1Id, created_at: ago(3, 2) },
      { user_id: userId, name: "plan_approved", props: {}, project_id: p1Id, created_at: ago(3, 1) },
      { user_id: userId, name: "build_succeeded", props: { ms: 4200 }, project_id: p1Id, created_at: ago(3, 1) },
      { user_id: userId, name: "first_preview", props: {}, project_id: p1Id, created_at: ago(3, 1) },
      { user_id: userId, name: "deployed", props: { env: "production" }, project_id: p1Id, created_at: ago(1) },
      { user_id: userId, name: "project_created", props: { source: "import" }, project_id: p2Id, created_at: ago(5, 4) },
      { user_id: userId, name: "mode_switched", props: { to: "pro" }, project_id: p2Id, created_at: ago(5, 3) },
      { user_id: userId, name: "pr_opened", props: {}, project_id: p2Id, created_at: ago(2) },
      { user_id: userId, name: "project_created", props: { source: "template" }, project_id: p3Id, created_at: ago(7, 1) },
      { user_id: userId, name: "agent_tested", props: { provider: "anthropic", tools: 2, ms: 940 }, project_id: p3Id, created_at: ago(3, 5) },
    ];
    await sb.from("events").insert(events);
  });

  console.log("\n✅ Done! Sign in as", DEMO_USER_EMAIL, "to see the seeded projects.\n");
}

main().catch((err) => {
  console.error("\n❌", err.message ?? err);
  process.exit(1);
});
