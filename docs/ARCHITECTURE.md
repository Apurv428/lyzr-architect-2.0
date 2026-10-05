# Architect 2.0: architecture

How Architect 2.0 works today, and how it would run in the real world for thousands of people building and running apps at the same time.

**How to read this.**
- Each section starts with **Today**: what the code in this repo does. File paths point at the implementation.
- It ends with **In production**: what changes at scale, and why.
- The diagram is [`architecture-diagram.svg`](architecture-diagram.svg). Solid boxes run today; dashed boxes are the production design.

---

## 1. The system at a glance

![Architect 2.0 architecture](architecture-diagram.svg)

| Layer | Today | In production |
|---|---|---|
| **Client** | Next.js 16 App Router UI: React 19, Zustand stores, React Flow agent canvas, Monaco editor | Same |
| **App sandbox** | Sandpack in the browser (default). WebContainer for Node apps. E2B wired but needs a key | Firecracker microVMs (E2B or Fly Machines) behind a preview ingress proxy |
| **App server** | Next.js on Vercel: `proxy.ts`, API routes, server actions | Same, plus a job queue for long builds |
| **Model layer** | `lib/ai/provider.ts`: Anthropic SDK, OpenAI SDK against any OpenAI-compatible URL; Gemini and Llama hosts | A gateway (LiteLLM-style) for routing, fallback, spend and caching |
| **Data** | Supabase: Postgres with row-level security everywhere, Auth, Storage, pgvector | Plus read replicas, partitioned event tables |
| **Background work** | Agent API, inbound webhooks, scheduled agents, eval sampling: all through security-definer Postgres functions | Plus a queue and workers (QStash or SQS) |
| **Integrations** | GitHub REST, Slack, MCP servers, outbound signed webhooks | GitHub App with webhooks for two-way sync |

**The core design rule.** The browser never holds a privileged database key, and neither do the public endpoints: the agent API, webhooks and the scheduler.
- **Signed-in calls** use the user's session, and row-level security decides what they see.
- **Public calls** go through narrowly scoped `security definer` functions. Each one checks a hashed token or a secret, rate-limits, and returns only what that token allows.
- **No service-role key** is used anywhere in the app.

---

## 2. From a prompt to a running app

The judging asks for this walkthrough explicitly. Every step names the code that does it.

1. **The user types an idea** on the dashboard or the landing page.
   - `createProject` stores the project and the first user message.
   - The workspace (`app/p/[id]/page.tsx`) loads the project, messages, checkpoints and agent.
   - `components/workspace/chat-panel.tsx` notices a single unanswered prompt and sends `action: "start"`.

2. **`POST /api/chat`** (`app/api/chat/route.ts`) runs as a Node.js function, with `maxDuration` 300 s. In parallel it loads:
   - the project and the last 60 messages;
   - the latest checkpoint's files;
   - the credit balance and the user's own model keys (encrypted);
   - whether a Slack webhook is saved;
   - the user's brand design tokens.

   It then builds a **byte-stable system prompt** (`lib/ai/prompt.ts`), so the prefix caches across turns. Per-turn state goes in the last user message: mode, connections, brand tokens, imported-repo notes, the current files, and a directive.

3. **The model is called with three typed tools:** `ask_questions`, `propose_plan` and `write_files`.
   - **Guided mode with a vague idea:** clarifying questions. They can include input fields, such as a Slack webhook or schedule times.
   - **Otherwise:** a plan.
   - **On models that sometimes narrate instead of acting** (Gemini), the route forces the right tool:
     - "required" on the first turn;
     - `propose_plan` right after the question card;
     - `write_files` after approval.

4. **The response streams back as NDJSON.** Each line is one `ChatEvent` (`lib/ai/schema.ts`):
   - `status`: progress, e.g. "Writing /App.tsx…";
   - `text`: streamed prose;
   - `message`: a saved card;
   - `files` and `credits`;
   - `done`.

   Tool input is validated with Zod before anything is saved.
   - **The plan schema is tolerant:** it re-shapes the flattened strings Gemini sends.
   - **The file schema is strict:** paths, no `..`, no platform files.

5. **The user answers questions, edits the plan if they like, and approves.** The approval turn forces `write_files`, and the route saves:
   - a `changes` message;
   - a new `checkpoints` row: the full file map as `jsonb`, written by the signed-in client under row-level security.

6. **The preview re-renders in the browser.** `components/preview/live-preview.tsx` hands the files to Sandpack. `lib/workspace/sandbox.ts` wraps them with:
   - an entry file;
   - a small inspector script (select-to-edit, thumbnails);
   - the platform helper `__architect__/connections`, which lets the app post to Slack for real through the parent page.

   Errors show an **Auto-fix** button that sends the error back as the next turn.

7. **The agent appears in the Agent tab.** `lib/agent/seed.ts` turns the plan into blocks:
   - a trigger (a schedule for timed agents);
   - the model ("brain") and the tools it matched;
   - knowledge, guardrails and the output.

   The test console streams a step-by-step trace from `/api/agents/test`.

8. **Deploy.**
   - `/api/deploy` freezes the latest checkpoint into a `deployments` row and streams staged log lines.
   - `/s/<slug>` serves that snapshot to anyone: a row-level security policy allows public reads of `status = 'ready'` deployments.
   - Rollback re-points production at an earlier row. Renaming the slug moves every deployment of the project.

9. **Afterwards the agent keeps working:**
   - other apps call it through the Agent API or a webhook;
   - it runs on its schedule;
   - its Slack posts go out for real.

---

## 3. Sandboxes: what runs each user's app, and why

### Today

| Runtime | Where it runs | Start-up | Isolation | Used for |
|---|---|---|---|---|
| **Sandpack** (default) | In the browser, bundled client-side | Instant | Cross-origin iframe | React + Tailwind apps the builder generates; imported React apps |
| **WebContainer** | Node.js in the browser | A few seconds (`npm install`) | Cross-origin iframe; needs COOP/COEP headers | Apps that need Node, or to check a ZIP export runs |
| **E2B** | Cloud microVM | ~1 s | Firecracker VM | Wired in `app/api/e2b/route.ts`, but **not working yet**: it doesn't upload the files and needs `E2B_API_KEY` |

**How the runtimes share one file format:**
- **Sandpack format:** generated apps put `App.tsx` at the root and load Tailwind from the CDN.
- **`viteProject()`** (`lib/workspace/scaffold.ts`) wraps the same files in a runnable Vite project: `package.json`, `index.html`, `main.tsx` and Vite config.
- **WebContainer** mounts that project, using the nested tree it requires.
- **"Download"** in the Code tab exports the same project, so `npm install && npm run dev` works locally.
- **Imported projects** keep their own `package.json`. Its runtime dependencies are passed to Sandpack, while its build setup is kept out of the preview.

**Why Sandpack first.** There's no infrastructure and no cold start, so a non-technical user sees their app in about a second. The trade-off is that generated apps have no server of their own; they reach real services through the platform (Slack posts, agent runs).

**Isolation headers.** WebContainers need cross-origin isolation, which blocks the Sandpack iframe and cross-origin avatars. `next.config.ts` therefore sends COOP/COEP only on `/p/:id?runtime=webcontainer`.
- **`credentialless`, not `require-corp`:** the generated app loads Tailwind from a CDN that sends no CORP header. Under `require-corp` that script is blocked and the preview renders unstyled; `credentialless` loads it without cookies.
- **Both sides must agree:** the header and `WebContainer.boot({ coep: "credentialless" })` use the same value.
- **Browser support:** Chrome and Edge, which is also where WebContainers run.

### In production

**Every user's app runs in a Firecracker microVM** (E2B, Fly Machines, or Firecracker directly).
- **Why not containers:** containers share the host kernel. Generated code installs arbitrary npm packages, so one tenant must not be able to reach another.
- **Speed:** microVMs give VM-level isolation with ~150 ms boots, and snapshots make resume nearly instant.

**Lifecycle:**
1. A build turn claims a VM from a **warm pool** per stack: Vite/React, Next.js, Python.
2. The checkpoint's files are written in. `npm install` is skipped when a cached `node_modules` layer matches the `package.json` hash.
3. The dev server runs on a fixed port. The ingress proxy (§6) gives it a per-session URL.
4. After 5 idle minutes the VM **hibernates** (a memory snapshot to object storage) and resumes in ~50 ms on the next request.

**Limits and cost:**
- Each VM gets 1 vCPU, 512 MB–1 GB RAM and 2 GB of disk, with egress allow-lists and a 15-minute cap per build session.
- The quota is 2 concurrent VMs per free user and 10 per paid user, enforced when a VM is claimed.
- At roughly $0.0002 per vCPU-second, 30 s of active work plus 5 idle minutes is about 7 cents per build turn. The idle cutoff and the warm-pool cap are the main levers.

---

## 4. The agent harness: plan, write, run tools, recover

### The builder (generates apps)

```
prompt ─▶ ask_questions? ─▶ propose_plan ─▶ (user edits / approves) ─▶ write_files ─▶ checkpoint
             ▲                                                              │
             └────────── Auto-fix: preview error → next turn ◀──────────────┘
```

**Typed tools, not free text.** The model can only act through the three tools.
- **Validated before saving:** every call is checked with Zod first (`lib/ai/schema.ts`).
- **Atomic changes:** each `write_files` call becomes a restorable checkpoint, and restoring never deletes history.

**Steering and recovery:**
- **Approval gate:** nothing is built until a plan is approved, which also caps runaway cost.
- **Forced tool calls:** used for models that narrate instead of acting (`tool_choice` in `app/api/chat/route.ts`).
- **Tolerant plan parsing:** Gemini sometimes sends `"Dashboard: shows…"` strings where objects belong, so they're re-shaped.
- **Malformed tool JSON:** the user gets a retry card, and nothing partial is saved.
- **Auto-fix:** turns a preview error into the next turn.
- **Retries** reuse the same input.

**Context:**
- **Byte-stable system prompt,** so it caches.
- **Per-turn state:** the current files and connections go in the last message.
- **Imported repos are capped** at 40 files / 150 KB, so they fit in context and on free-tier model quotas.

**Not built yet, deliberately: an autonomous loop.** An agent that runs commands, reads test output and fixes its own errors needs:
1. a terminal tool and a browser/screenshot tool inside the microVM;
2. a step and token budget per task (for example 20 tool calls, $0.50);
3. a planner that checks its own work against the approved plan.

Keeping the user in the loop is the right default for the Guided persona. The microVM design in §3 is what makes the autonomous loop possible for Pro mode later.

### The agent runtime (the user's own agents)

One runner, `runAgent` in `lib/agent/run.ts`, serves:
- the test console;
- evals and Autopilot;
- the public Agent API, and the same agent served over MCP;
- inbound webhooks;
- the scheduler.

```
input
  → trigger, knowledge retrieval (BM25 + pgvector, rank-fused) with page citations
  → guardrail rules into the system prompt
  → coordinator (Manager → Specialist sub-agents), if present
  → tool loop: model call → tool calls → results → model call … (max 6 turns; if the model is still calling tools after that, it's asked once more with no tools, so a run always ends with an answer)
       tools = catalog tools (live: web search on Claude, Slack; others simulated and labelled)
             + MCP server tools (live)
  → PII redaction on the reply
  → output + trace (every step: type, input, result, ms, tokens, live/simulated)
```

**Run context.** Signed-in runs (test console, evals, Autopilot) pass the user's own Supabase client, so row-level security still applies. It unlocks:
- the coordinator reading its linked specialists;
- pgvector search, fused with BM25;
- OAuth connectors (Slack, Gmail, HubSpot).

Public runs (API, MCP, webhooks, schedules) have no session. They get documents from their begin RPC, rank with BM25, and the coordinator answers alone. In production, a security-definer read of the linked specialists closes that gap.

**MCP.** An MCP block connects the agent to any Model Context Protocol server over Streamable HTTP (`lib/agent/mcp.ts`). Each run:
1. performs the `initialize` handshake;
2. lists the server's tools (`tools/list`) and offers them to the model as `mcp<n>__<tool>`;
3. calls them with `tools/call`.

**MCP safety:**
- **Public https only:** server URLs pass the same check as webhook forwards, with DNS resolution to block private addresses.
- **Encrypted tokens:** tokens are encrypted when the agent is saved and never appear in exported code.

**Evals.** Saved tests come in three kinds: text present, text absent, or AI judge.
- **Sampled traffic:** 1 in 10 API and webhook runs becomes a *suggested* test (inside `api_finish_run` and `webhook_finish_run`).

**Autopilot: the agent improves itself** (`lib/agent/autopilot.ts`, `app/api/agents/autopilot`, `components/agent/autopilot-tab.tsx`):

```
generate  model reads the agent's instructions, rules, tools, knowledge
          → 6 scenarios aimed at it: 2 core-job edge cases, injection, personal data, off-topic, invented promises
run       the eval runner streams each scenario through runAgent; an AI judge grades it   (no new runner)
fix       model reads only the failures: message, expected behaviour, actual reply, judge's reason
          → { diagnosis, up to 4 new rules, rewritten instructions or null }
apply     applyFix() appends rules to the guardrail connected to the Brain (or adds one), swaps instructions
re-test   every scenario again, not just the failures, so a fix that breaks a passing case shows in the score
```

- **Small, reviewable fixes:** rules first, instructions only when rules can't fix it; the diff is shown before it's applied and autosave versions the graph.
- **Never a dead end:** without a model, or if the reply can't be parsed, the standard six scenarios run instead; errored cases are shown as "not graded" rather than passes.
- **Cost:** one credit per model step (generate, fix), plus the usual eval run cost; free with your own key.
- **Keeps paying off:** scenarios can be saved as regression tests in one click.

**Agents as MCP servers** (`lib/agent/mcp-server.ts`, `app/api/mcp/[agentId]`). The reverse of the MCP block: every agent is itself an MCP server, so Claude Desktop, Cursor, VS Code or another agent can call it.
- **Transport:** Streamable HTTP with plain JSON replies (no server-initiated stream; `GET` is 405, which clients treat as "POST only"). Batches of up to 20 messages; notifications get 202.
- **Protocol:** `initialize` (negotiates 2025-06-18, 2025-03-26 or 2024-11-05), `ping`, `tools/list` (one `ask_<agent>` tool taking `message` and optional `history`), `tools/call`; empty `resources/list` and `prompts/list`.
- **Auth:** the agent's API key as a Bearer token. A missing key is a 401 with `WWW-Authenticate`; a wrong or revoked key is a 401 with `error="invalid_token"`, so clients ask for a new one.
- **One code path:** `runWithApiKey()` (`lib/agent/api-run.ts`) is shared with `/api/v1`, so MCP calls get the same rate limit, credits, logs, Usage chart and traffic sampling.

---

## 5. Model-agnostic: Claude, GPT, Gemini, open-source

### Today

**The builder (`chatProvider()` in `lib/ai/provider.ts`):**
- **Choosing a provider:** Anthropic or OpenAI, with `AI_PROVIDER` as the preference.
- **The platform key** follows `OPENAI_BASE_URL`, so any OpenAI-compatible endpoint can stand in for OpenAI. This deployment runs on **Gemini** that way.
- **A user's own key** (Settings → AI models, verified, then stored encrypted) always goes to its real provider, and its calls don't spend credits.

**Agents choose per Brain block:**

| Choice | Runs on |
|---|---|
| Claude Opus 5 / Sonnet 5 / Haiku 4.5 | Anthropic SDK (adaptive effort; server-side fallback model) |
| GPT-5.5 | OpenAI SDK |
| Gemini | `GEMINI_API_KEY`, or the platform key when it already points at Gemini (`compatibleHost()`) |
| Llama | Any OpenAI-compatible host via `LLAMA_BASE_URL`: Groq, Together, OpenRouter, local Ollama |

**Free-tier rate limits.** Gemini's free tier allows 15 requests a minute, and one Autopilot pass makes about 13 calls. Clients for OpenAI-compatible hosts use `patientFetch` (`lib/ai/provider.ts`): on a per-minute 429 it waits the `retryDelay` Google returns (up to a minute) and retries once. The cooldown is shared by every call in the process, so parallel eval cases wait together. Daily quotas and long waits fail fast with a clear message.

**Unconfigured models:**
- **Gemini or Llama without a host:** the run stops with a clear message instead of a stack trace.
- **Claude or GPT without a key:** the runner falls back to the configured provider and says so in the trace.

**Generated code follows the choice:**
- LangGraph uses `ChatGoogleGenerativeAI` for Gemini, and `ChatOpenAI` with a `base_url` for Llama.
- CrewAI uses LiteLLM model strings.

**What "without anything else breaking" required:**

| Capability the product depends on | Claude | GPT-5.5 | Gemini | Llama (via host) |
|---|---|---|---|---|
| Reliable tool calls | ✅ | ✅ | ⚠️ narrates sometimes → forced `tool_choice` | ⚠️ host-dependent |
| Strict JSON in tool input | ✅ | ✅ | ⚠️ drops "required" fields → tolerant schemas with defaults | ⚠️ |
| Streamed tool-call deltas | ✅ | ✅ | ⚠️ omits `index` → reconstructed by order | varies |
| Vision (screenshot → app) | ✅ | ✅ | ✅ | model-dependent |
| Native web search | ✅ server tool | ❌ (simulated, labelled) | ❌ | ❌ |
| Embeddings for pgvector | One platform embedding model for all documents and queries, so vectors are always comparable (`gemini-embedding-001` at 1536 dims here), whichever model runs the agent | | | |

### In production

1. **A gateway** (LiteLLM or similar) in front of every model call. It handles:
   - one request shape;
   - retries with backoff, and failover from primary to secondary to demo;
   - per-user spend tracking;
   - spreading load across key pools.
2. **Per-model adapters.** Each model is tested against the builder's eval suite before it can be picked. The fixes in the table above become adapter code rather than route code.
3. **Routing by cost and latency:**
   - clarifying questions and short edits go to a small fast model;
   - plans and full builds go to the strongest model;
   - judges go to a cheap model.

---

## 6. How the frontend talks to the backend and the sandbox

### Today

| Channel | Format | What flows |
|---|---|---|
| Browser → `/api/chat` | POST JSON → **NDJSON** stream | `status`, `text`, `message`, `files`, `credits`, `done` events |
| Browser → `/api/agents/test`, `/api/agents/evals` | POST JSON → **NDJSON** stream | `step` (trace), `reply`, `result`, `done`, `error` |
| Browser → server actions | React Server Actions | Projects, checkpoints, agents, GitHub, workspaces, schedules, design tokens |
| Workspace ↔ preview iframe | `postMessage` | `architect:select-mode` / `architect:selected` (select-to-edit) · `architect:ready` / `architect:capture` / `architect:captured` (thumbnails) · `architect:slack` / `architect:slack-result` (the app's Slack posts, sent by the server with the project's encrypted webhook, owner only, 10 per minute) |
| `/s/<slug>` | Server-rendered page + Sandpack | Public snapshot, no login |

The preview is a cross-origin iframe, so app code can't touch the workspace's cookies or storage. Everything it needs from the platform goes through the message bridge, and the parent checks `event.source` before acting.

### In production (remote sandboxes)

```
browser ──HTTPS──▶ app server ──▶ sandbox control plane (claim VM, write files, exec)
   │                                         │
   └──iframe──▶ https://<session>.preview.architect.app ──▶ ingress proxy ──▶ VM:3000
                              (signed, short-lived session token)      (WebSocket for HMR)
```

- **File writes** go from the app server to the VM over the control plane, as diffs per checkpoint. Hot module reload then updates the iframe without a full reload.
- **Logs and terminal output** stream back over a WebSocket into the workspace's console drawer.

---

## 7. The proxy layer

"Proxy" means three different things here.

1. **`proxy.ts` (today).** Next.js 16's name for middleware; it runs on the **Node.js runtime** by default. It:
   - refreshes the Supabase session cookie;
   - redirects signed-out users away from private pages;
   - bounces signed-in users from the login and signup pages.

   It's not a network proxy.
2. **Preview ingress (production).** Caddy, Envoy or a small Go proxy in front of the VMs, serving `*.preview.architect.app`. It:
   - maps the subdomain to the VM's address through a registry (Redis), updated as VMs start, hibernate and resume;
   - checks a signed, short-lived preview token;
   - proxies WebSockets for hot reload;
   - rate-limits per user;
   - sets COOP/COEP only there, so the main app never needs them.

   A dedicated proxy is needed because a single Next.js deployment can't route wildcard subdomains to thousands of moving ports.
3. **Model gateway (production).** See §5.

---

## 8. GitHub integration

### Today

**Connect:**
- **OAuth:** through Supabase's GitHub provider. The provider token is stored in an **encrypted cookie** (AES-256-GCM, `ARCHITECT_SECRET`), never in the database.
- **Personal access token:** a fallback that works before the OAuth app is configured.

**Import** (`lib/github.ts`, `lib/actions/github.ts`):
- **Analysis:** stack detection from `package.json` and Python manifests, plus existing AI libraries (LangChain, LangGraph, CrewAI, OpenAI Agents SDK…). The detected framework is suggested.
- **Real files load:** the repo's source is pulled into the project's first checkpoint, up to 40 readable files and 150 KB, with app code first (`fetchRepoFiles`).
  - Raw downloads don't count against the API rate limit.
  - Private repos fall back to the contents API.
- **Preview:** if the app lives in `src/`, a one-line `App.tsx` shim points the preview at it.
- **ZIP upload** of a local project runs the same pipeline, unzipped in the browser.

**Publish:**
- **New repo:** one commit containing the app, plus the agent's generated code under `architect/agent/`.
- **Existing repo (pull request):** a new branch, one commit (Git Data API: tree → commit → ref) and the PR. For an imported repo, the PR carries **only the files changed since the import, at their real paths**, and never Architect's own shim files.
- **GitAgent settings** (Pro → Agent → GitAgent) shape the result: branch prefix, commit style (conventional, imperative or descriptive), and rules, skills and identity appended to the PR description.

### In production

1. **A GitHub App instead of an OAuth App:**
   - fine-grained permissions per repo, organisation-wide installs;
   - a bot identity for PRs;
   - **webhooks** for two-way sync.
2. **Sync.** A `push` webhook (to an endpoint like the existing `/api/hooks/:token`) creates a checkpoint from the pushed files. If the same file changed on both sides, the workspace shows a conflict banner with a three-way diff.
3. **Large repos:** the file tree goes to the model, and it asks for the files it needs (a `read_files` tool), instead of everything up front.

---

## 9. Deployment: users' apps and Architect itself

### Users' apps, today

**What's real:**
- A deploy freezes a checkpoint into `deployments.files`.
- `/s/<slug>` renders it publicly; preview deploys are pinned with `?d=<id>`.
- Promote and roll back re-point `is_current`.
- The slug can be renamed: it's unique, and every deployment of the project moves with it.
- Env vars are saved encrypted.

**Not real (shown honestly in the UI):** the build logs (staged for the UX), custom-domain DNS checks, and "Deploy to your VPC".

### Users' apps, in production

1. **Build** in a short-lived microVM: `viteProject()` → `vite build` → `dist/`.
2. **Upload** to object storage under `deployments/<id>/`.
3. **Serve** from a CDN: Cloudflare, or Vercel's edge.
   - Custom domains: a CNAME to the edge, plus an automatic certificate.
   - Rollback: switch the CDN origin prefix, with no rebuild.
4. **Secrets:** public ones are baked in at build time; server-side ones are injected by an edge function, so they never reach the bundle.

### Deploying Architect itself

| Layer | Service | Why |
|---|---|---|
| App | Vercel | Native Next.js, preview deploy per PR, edge network |
| Database, Auth, Storage, vectors | Supabase | Postgres with row-level security, Auth (email and Google; GitHub when configured), Storage, pgvector, pg_cron, one bill |
| Sandboxes | E2B or Fly Machines | Firecracker microVMs, snapshots, per-second billing |
| Queue | Upstash QStash or SQS | Long builds, webhook fan-out, scheduled runs at scale |
| Monitoring | Sentry and Vercel Analytics | Errors and request metrics; `events` table for product metrics (`/metrics`) |

**Environments:** development (local), preview (a Vercel deploy per PR with a staging Supabase project) and production.
- `NEXT_PUBLIC_*` values are baked in at build time, so they must be set before the first build.
- `ARCHITECT_SECRET` must be identical across every instance that shares a database, or encrypted values can't be read back.

---

## 10. Background work without a privileged key

The agent API, inbound webhooks and the scheduler run with no signed-in user. Each uses the same pattern: **a public route, plus `security definer` functions that check a credential and return only what it unlocks.**

| Entry point | Credential | Begin / claim | Finish |
|---|---|---|---|
| `POST /api/v1/agents/:id/run` and `POST /api/mcp/:id` | API key (`arc_live_…`), stored as SHA-256 | `api_begin_run`: key check, 60/min rate limit | `api_finish_run`: log, credit, 1-in-10 eval sampling |
| `POST /api/hooks/:token` | Webhook URL token (`whk_…`), stored as SHA-256 | `webhook_begin_run`: 30/min rate limit, pause state | `webhook_finish_run`; optional signed forward (`X-Architect-Signature: t=…,v1=HMAC-SHA256`) |
| `GET /api/cron/schedules` | `CRON_SECRET`, which equals a secret generated by migration 0017 | `scheduler_claim`: due schedules, `FOR UPDATE SKIP LOCKED`, next run set in the schedule's timezone | `scheduler_finish`: log (source `schedule`), credit |

**How the scheduler runs.** Something calls `/api/cron/schedules` every minute. The simplest option is inside Supabase:

```sql
select cron.schedule('architect-schedules', '* * * * *', $$
  select net.http_get(
    url := 'https://<your-app>/api/cron/schedules',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select secret from private.scheduler_secret))
  )
$$);
```

cron-job.org or Vercel Cron work the same way. Vercel's Hobby plan only allows daily crons, which is why the database-side option comes first.

- **Each due schedule is claimed once.** Its next run is computed in its own timezone, with weekday filters, before the agent runs, so a slow run is never picked up twice.
- **Daylight saving is handled.** The tests check New York's change on 1 November 2026.

**In production,** claims go onto a queue and workers run the agents, so one slow model call can't delay the rest of the minute's schedules.

---

## 11. Data model and security

- **Row-level security** on every table, with owner-only policies by default. Workspace members get two extras, both through `security definer` helpers so the rules never recurse:
  - **read** access to projects shared with their workspace (the project row and its checkpoints, but not its chat);
  - comments on those projects.
- **Credits** are only changed by database functions. The browser can't write them: `profiles` is update-protected column by column.
- **Encrypted with AES-256-GCM** (`ARCHITECT_SECRET`):
  - GitHub tokens, in cookies;
  - env vars, including Slack webhooks;
  - users' model keys and webhook tokens;
  - MCP tokens.
- **Hashed with SHA-256:** API keys and webhook tokens.
- **Outbound requests:**
  - webhook forwards, MCP servers and design-token URLs must be public https; DNS is resolved to block private addresses, and redirects aren't followed;
  - Slack posts only go to `hooks.slack.com/services/…` URLs.
- **Invites** are links bound to the invited email. The workspace's SSO domain is enforced when the link is accepted.
- **Logins:** post-login redirects are same-origin only. The dev-only test login route is disabled unless `E2E_SECRET` is set, and never runs in production.

---

## 12. Scaling to thousands of concurrent builders

| Pressure | Today | At scale |
|---|---|---|
| Long chat streams hold a function for up to 300 s | Fine at hundreds of users | Turns become jobs: `POST /api/chat` enqueues and returns a job id; workers stream events over SSE or a WebSocket channel from Redis pub/sub |
| Sandboxes | In the browser: free, scales with users | Warm pools per region and stack, hibernation, per-user quotas at claim time, session affinity per project |
| Model rate limits | Free-tier Gemini: per-minute caps surface as "busy, retry" | Gateway with key pools, backoff, failover, prompt caching (the stable system prompt is ~90% of input tokens on follow-ups) |
| Postgres connections | Supabase pooler | Transaction pooling for all serverless calls; read replicas for `/s/<slug>` and `/metrics` |
| Unbounded tables (`agent_runs`, `events`, `webhook_calls`) | Single tables | Monthly partitions, older ones archived to object storage |
| Webhooks and schedules | Run inside the request; the scheduler claims 20 per minute | Queue plus workers; claims return only ids and workers load the rest |
| Cost control | 100 credits a day per user, spent in Postgres; own keys bypass credits | Per-plan budgets, cheap models for cheap turns, the plan-approval gate before expensive builds |

---

## 13. What's real and what's simulated

| Real | Simulated or staged (and labelled in the UI) |
|---|---|
| Auth (email, Google), Postgres with row-level security, Storage | Agent tools other than web search, Slack and MCP: they return realistic sample data marked "simulated" |
| Builder: questions → plan → build, checkpoints, Auto-fix, select-to-edit | Deploy build logs, custom-domain DNS, VPC deploy |
| Preview: Sandpack, WebContainer | E2B preview (needs a key, and file upload isn't written yet) |
| Agents: test console, evals, Autopilot, knowledge with citations, multi-agent, MCP client and server | Marketplace listings (sample data, labelled "Preview") |
| Agent API, inbound webhooks, schedules, real Slack posts | Pricing page |
| GitHub: connect, import real files, ZIP import, new repo, pull requests | |
| Workspaces, invite links, read-only sharing, preview comments | |
