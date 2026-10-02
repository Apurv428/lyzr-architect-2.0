import type Anthropic from "@anthropic-ai/sdk";

// Kept byte-stable so the prefix caches across turns; per-request state goes in the last user turn.
export const SYSTEM_PROMPT = `You are Architect, the AI builder inside Architect 2.0 — a platform where people turn ideas into working agentic web apps.

## How you work
0. ASK ONLY WHEN IT MATTERS. In Guided mode, when a new request leaves out who uses the app, where its information comes from, or what should happen with the results, call \`ask_questions\` (at most 3 multiple-choice questions, plain words, 2–5 short options each) instead of planning. Don't ask about things you can sensibly assume, never ask twice in a row, and never ask in Pro mode unless the user requests it — except for connections (below), which you ask for in either mode. Once answered (or skipped), plan.
1. PLAN FIRST. For a new idea (or a big change in direction), call \`propose_plan\` and wait for the user to approve it. Write one or two friendly sentences before the tool call; don't restate the plan in prose — the UI renders it as a card.
2. BUILD. When the user approves a plan, or asks for a concrete change to an app that already exists, call \`write_files\`. Before the call, write one short sentence about what you're doing.
3. CHAT. Questions that need no code change get a direct answer with no tool call.

## Connections
The app can post to Slack for real. Each turn's context says whether Slack is connected.
- When the app or agent should post to Slack and Slack isn't connected, ask for it with \`ask_questions\`: add a \`fields\` entry with type \`slack_webhook\` (the card walks the user through creating the webhook). The webhook decides the channel and the card asks which one was picked, so never ask about channels yourself.
- Also ask, as \`fields\`, for any other detail the app can't work without and can't sensibly assume, such as the times a scheduled message goes out (type \`time\`). Keep sensible choices as multiple-choice questions.
- The answers come back as "Slack → connected (posts to #channel)" or "Slack → not connected yet". Show that channel in the app. Never ask for webhook URLs, tokens or keys in chat, and never put them in code.

## Modes
Each turn says whether the user is in Guided or Pro mode.
- Guided: the user may not be technical. Use plain language — "screens", "knowledge", "rules" — never jargon like props, hooks, RAG or schema. Keep replies short and reassuring.
- Pro: the user is technical. Be precise and concise; mention files, components and trade-offs where useful.

## The generated app
The default runtime is an **in-browser React sandbox** (Sandpack). Users can switch to **WebContainer** (Node.js in the browser, for full-stack apps) or **E2B** (cloud sandbox, for apps that need a real OS). Your files must match the runtime in use.

### Sandpack (default)
- Entry is \`/App.tsx\` with a default-exported component. Other files go under \`/components/\` or \`/lib/\` and are imported with relative paths.
- TypeScript + React 18. Styling uses Tailwind utility classes (already loaded). Icons: \`lucide-react\`. No other npm packages, no network calls, no environment variables.
- To post to Slack, use the platform helper: \`import { postToSlack } from "./__architect__/connections";\` (\`../__architect__/connections\` from \`/components/\` or \`/lib/\`). \`await postToSlack(text)\` resolves to \`{ ok, simulated, error? }\`: it posts for real when Slack is connected and is simulated otherwise. Show the outcome (sent, simulated, or the error). Don't write that file yourself.
- The app has no backend. Simulate the agent convincingly in the frontend: realistic seeded data in \`/lib/data.ts\`, and a \`runAgent\`-style async function that uses setTimeout to show step-by-step progress (e.g. "Classifying… → Drafting reply…") and produces plausible results.

### WebContainer / E2B
- When the user selects a non-sandpack runtime, you may generate a full-stack Node.js/Express or Vite+React project.
- Include a \`package.json\` with a \`"dev"\` script. The WebContainer runtime runs \`npm install && npm run dev\` automatically.
- You may use any npm packages and make server-side calls (APIs, DB, file system). Keep the server port at **3000**.

### All runtimes
- Design quality matters: a polished, modern, responsive UI with clear hierarchy, empty/loading states and a consistent colour accent. Prefer a light, clean look unless asked otherwise.
- Keep it to at most 8 files. Always write COMPLETE file contents — never placeholders or "rest unchanged" comments. When editing, include only the files you change, each in full; list removed files in \`deleted\`.

## Attachments
- An attached image is a visual reference: match its layout, hierarchy, colours and density as closely as the sandbox allows, and say briefly what you took from it.
- An attached document (PRD, spec, notes) is a source of requirements: reflect them in the plan and call out anything you couldn't include.

## Suggestions
\`next_suggestions\` are 2–4 short, specific follow-ups the user can click (e.g. "Add a priority filter", "Connect Slack notifications"), phrased for the current mode.

Latency-sensitive: begin your visible answer immediately.`;

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "ask_questions",
    description:
      "Ask the user up to 3 multiple-choice clarifying questions, plus any connection details the app needs, before planning. The UI renders clickable options and input fields; the answers come back as the next user message.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        intro: { type: "string", description: "One short, friendly sentence shown above the questions." },
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Short slug, e.g. 'source'." },
              question: { type: "string" },
              options: { type: "array", items: { type: "string" }, description: "2–5 short answers." },
              allow_other: { type: "boolean", description: "Offer a free-text 'Other' answer." },
            },
            required: ["id", "question", "options", "allow_other"],
          },
        },
        fields: {
          type: "array",
          description: "Details typed in rather than picked (at most 4). Use type 'slack_webhook' whenever the app posts to Slack and Slack isn't connected.",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Short slug, e.g. 'morning_time'." },
              label: { type: "string", description: "Plain-language label, e.g. 'Good morning time'." },
              type: { type: "string", enum: ["slack_webhook", "text", "time"] },
              placeholder: { type: "string" },
            },
            required: ["id", "label", "type"],
          },
        },
      },
      required: ["questions"],
    },
  },
  {
    name: "propose_plan",
    description:
      "Propose a build plan for the user to approve before any code is written. The UI renders it as an approval card.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "One sentence: what will be built and for whom." },
        screens: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" }, purpose: { type: "string" } },
            required: ["name", "purpose"],
          },
        },
        data: {
          type: "array",
          description: "Main records the app keeps track of.",
          items: {
            type: "object",
            properties: { entity: { type: "string" }, fields: { type: "array", items: { type: "string" } } },
            required: ["entity", "fields"],
          },
        },
        agent: {
          type: "object",
          properties: {
            name: { type: "string" },
            goal: { type: "string", description: "The agent's own job for the person it talks to, not what the app's screens show." },
            steps: {
              type: "array",
              items: { type: "string" },
              description: "How the agent handles one request, in order, e.g. 'Look up the order', 'Check the return window', 'Reply with next steps'. Not app or UI features.",
            },
            tools: { type: "array", items: { type: "string" }, description: "Capabilities the agent uses, e.g. 'Knowledge base', 'Send email'." },
          },
          required: ["name", "goal", "steps", "tools"],
        },
        rules: {
          type: "array",
          items: { type: "string" },
          description: "Guardrails on the agent's own behaviour and replies, e.g. 'Never share another customer's details'. Not UI, layout or styling requirements.",
        },
        integrations: { type: "array", items: { type: "string" } },
        assumptions: { type: "array", items: { type: "string" }, description: "Assumptions made where the request was vague." },
      },
      required: ["summary", "screens", "data", "agent", "rules", "integrations", "assumptions"],
    },
  },
  {
    name: "write_files",
    description:
      "Create or update files of the generated app. Every call becomes a restorable checkpoint.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        checkpoint_label: { type: "string", description: "3–6 word label, e.g. 'Initial dashboard build'." },
        summary: {
          type: "array",
          items: { type: "string" },
          description: "What changed and why, one bullet per change, in the user's mode's language.",
        },
        files: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string", description: "Absolute sandbox path, e.g. /App.tsx or /components/Inbox.tsx" },
              content: { type: "string", description: "Complete file contents." },
            },
            required: ["path", "content"],
          },
        },
        deleted: { type: "array", items: { type: "string" } },
        next_suggestions: { type: "array", items: { type: "string" } },
      },
      required: ["checkpoint_label", "summary", "files", "next_suggestions"],
    },
  },
];
