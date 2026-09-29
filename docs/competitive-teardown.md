# Competitive Teardown

Test brief used for every tool: *"Build a support-ticket triage agent with a dashboard."*

---

## Summary table

| Platform | Positioning | Where it shines | Where users get stuck | What Architect 2.0 takes / avoids |
|---|---|---|---|---|
| **Architect.new (current)** | Text-to-agent for enterprises | Agent-first: tools, RAG, guardrails, APIs; strong governance story | Feels technical for business users; less of a "build a whole app" feel | Keep the agent depth; add plan-first guidance and a Guided mode |
| **Lovable** | Prompt → full-stack web app | Beautiful first output, polished UX, Supabase integration | Hard to recover when the AI loops on a bug; little insight into what changed | Checkpoints + change summaries + auto-fix |
| **Bolt.new** | In-browser full-stack dev environment | Instant running environment, real file system | Token burn on fix loops; code-first feel for beginners | Preview-first for Guided, code for Pro |
| **Vercel v0** | UI / component generation | Top-quality UI and design system output | App logic and agents are secondary | Match the UI polish, but make the agent the core |
| **Replit Agent** | Agent that builds and hosts apps | End-to-end: code, database, deploy in one place | Long autonomous runs are hard to steer | Approval gate before building; small steerable steps |
| **Emergent** | Agentic app builder | Multi-agent build pipeline, full-stack ambition | Opaque progress, slow iterations | Transparent progress ("Writing /App.tsx") and a trace |
| **Rocket.new** | Prompt → app with templates | Fast starts from templates | Templates constrain customisation | Templates as a starting point, then a plan to refine |
| **Cursor** | AI-native IDE | Best-in-class code editing in real repos | Assumes a developer; no app/agent product layer | Import repo → PR flow for engineers |
| **Claude Code / Codex** | Agentic coding in terminal / cloud | Deep repo understanding, autonomous multi-file changes | Not for non-developers; no visual preview | Same "work in your repo, ship a PR" contract, with a visual layer |

---

## Platform deep-dives

### Architect.new (current version)

**Product position:** enterprise agent platform. Technical users configure agents with tools (SQL, HTTP, email, CRM), RAG over documents, guardrails, and an API. It's a configuration product, not a build product.

**Feature list:**
- Agent canvas with tool configuration (not visual drag-and-drop)
- Document ingestion (PDF, URL) with vector search
- Guardrails: PII redaction, topic blocking
- Agent API with keys and usage metrics
- Team workspaces, roles, audit logs
- No code generation; no live preview; no GitHub integration

**UX and flows:**
- Login → workspace → create agent → add tools → add knowledge → set guardrails → test → publish API key
- No onboarding or templates; requires domain knowledge to configure
- Test console shows a chat interface; no step-level trace visible to the user
- ~8 clicks to get a first working agent

**Gaps Architect 2.0 fills:**
- Non-technical users cannot build here (no plan card, no Guided mode, no preview)
- No generated app; agents are logic only, with no visual front-end
- No GitHub import or PR flow for engineers

---

### Lovable

**Product position:** prompt → full-stack web app for non-technical founders and indie hackers.

**Feature list:**
- Prompt → React + Supabase app with real auth, database, and deployment
- Supabase integration: tables, auth, storage set up automatically
- GitHub sync: two-way, commits on every change
- Preview in the browser
- Select element → edit (similar to select-to-edit)
- Chat to iterate; "Undo" rolls back the last change
- No agent canvas; no knowledge files; no framework code export
- No clarifying questions; goes straight to building

**UX and flows:**
- Landing page has a prominent prompt box
- After prompting: a loading screen (~20–40 s), then the app + editor side by side
- Sidebar: Pages, Components, Data, Integrations, Publish
- No plan card; the build starts immediately
- Errors surface as a red banner with "Fix with AI" — equivalent to Auto-fix
- Undo history is limited (~10 steps); older states are gone

**Where users get stuck:**
- When the AI loops on a bug (fix → break → fix), users have no checkpoint to restore to beyond the ~10-step undo
- No visibility into what changed or why (no change summaries, no diffs in the free tier)
- Data model is opaque; non-technical users don't know what tables were created

**What Architect 2.0 takes:**
- The "select an element → say how to change it" flow
- The clean, preview-dominant layout
- Supabase as the backend

**What Architect 2.0 avoids:**
- Building before a plan is approved (users can't steer the first build)
- Hiding checkpoints (non-destructive restore is core, not a premium feature)

---

### Bolt.new

**Product position:** in-browser full-stack dev environment. Targets developers who want a real Node.js runtime.

**Feature list:**
- WebContainer in the browser: real Node.js, npm, file system
- Prompt → app with a real server (Express, Astro, SvelteKit, etc.)
- File tree + Monaco editor
- Terminal (runs in WebContainer)
- Deploy to Netlify or StackBlitz
- Import from GitHub; sync back
- No agent canvas; no knowledge files; no plan card; no Guided mode

**UX and flows:**
- Landing page: a large text area and a set of starter templates (React, Astro, Next.js, Vue, etc.)
- After prompting: splits into chat (left) and editor + preview (right)
- File tree is visible from the start; code-first presentation even on first load
- Errors shown in a terminal panel; "Fix" button sends the error to the model
- Heavy use of tokens: a medium-complexity app can burn 50k+ tokens in one session

**Where users get stuck:**
- Non-technical users see a terminal and a file tree immediately — overwhelming
- Fix loops are expensive: each "fix" can use 5–10k tokens; free tiers run out fast
- WebContainer cold-start (~3–5 s) adds friction on every new project

**What Architect 2.0 takes:**
- The in-browser runtime concept (Sandpack for React apps; WebContainer as an opt-in)
- The "import from GitHub" flow

**What Architect 2.0 avoids:**
- Showing code and a terminal to non-technical users by default
- Allowing builds to start without a plan (token waste, loss of intent)

---

### Vercel v0

**Product position:** UI component generator. Targets designers and frontend engineers who know what they want to build but want to skip the boilerplate.

**Feature list:**
- Prompt → React component or page with Tailwind, shadcn/ui, Radix
- Fork → iterate in a chat
- Copy code or open in Vercel → deploys instantly
- Figma plugin for design → code
- No agent canvas; no database; no auth; no knowledge files
- Output is a component, not a full app

**UX and flows:**
- Minimal: a prompt box on a dark background
- After prompting: the rendered component (right) + code (left)
- Refinement is through the chat; each message produces a new variant
- "Deploy" creates a Vercel project in two clicks
- No onboarding; assumes you know React and Tailwind

**Where users get stuck:**
- The output is a single file; building a multi-page app requires manually combining components
- No state management, no backend, no auth — these are left to the user
- Non-technical users cannot extend the output beyond what they can describe

**What Architect 2.0 takes:**
- The component-quality output (Tailwind + shadcn/ui + Radix) is the design bar to meet
- The instant preview model

**What Architect 2.0 avoids:**
- Stopping at the component; the full app, agent, and deploy are the product

---

### Replit Agent

**Product position:** end-to-end: prompt → app → hosted, with a full IDE inside.

**Feature list:**
- Prompt → full-stack app (Python, Node, etc.) running in a Replit container
- Real database (Replit DB, or PostgreSQL add-on)
- Real hosting on replit.app
- IDE with file tree, Monaco, terminal, shell
- GitHub import/export
- Multiplayer (share a Repl with a teammate)
- Agent runs autonomously (10–20 tool calls without asking the user)
- No plan card; no Guided mode; no visual agent canvas

**UX and flows:**
- "Build me X" → the agent runs for 30–120 s, making many file changes and running shell commands
- The user watches a scrolling log of agent actions
- When done, the preview appears and the user can chat to refine
- Errors often silently cascade (the agent fixes one bug and introduces another)
- Undo is limited; recovery from a bad agent run is hard

**Where users get stuck:**
- The autonomous loop makes 10–20 changes in one go; it's hard to tell which change broke things
- Non-technical users are overwhelmed by the IDE view
- Long runs (60+ s) with no intermediate preview feel like waiting, not building

**What Architect 2.0 takes:**
- The ambition: end-to-end from prompt to hosted app
- GitHub integration built in from the start

**What Architect 2.0 avoids:**
- Autonomous runs without an approval gate
- Showing the full IDE to non-technical users
- Silent error cascades (every change is a checkpoint; errors surface immediately in the preview)

---

### Emergent

**Product position:** agentic app builder for enterprise. Multi-agent build pipeline.

**Feature list:**
- Prompt → multi-agent build (planner, coder, reviewer agents in sequence)
- Full-stack output: frontend + backend + database schema
- "Projects" view showing agent logs
- Deploy to a hosted environment
- No GitHub integration; no select-to-edit; no framework code export; no BYO model key

**UX and flows:**
- Prompt → waiting screen (30–90 s) while multiple agents work in sequence
- Result: a project overview with tabs for app, code, and build log
- Iteration is slow: each change triggers a full multi-agent pass
- No diff view; no checkpoint history in the UI

**Where users get stuck:**
- Build time is long (~60 s for a simple change)
- No way to see what changed between builds (no diffs)
- Agents can produce inconsistent output across runs

**What Architect 2.0 takes:**
- The idea of a plan card that makes the agent's intent legible before building

**What Architect 2.0 avoids:**
- Opaque multi-agent builds (Architect's builder is a single model with typed tools; progress is visible line by line)
- Long waits for iteration (Sandpack re-renders in the browser; there is no remote build step for the preview)

---

### Rocket.new

**Product position:** prompt → web and mobile apps, from the team behind DhiWise, a design-to-code tool. It pitches production-ready code rather than prototypes.

**Feature list (from its public site and demos):**
- Chat-to-app for the web (React / Next.js) and mobile (Flutter)
- Figma import that turns a design file into screens (the DhiWise heritage)
- A template gallery to start from a working app
- Integrations offered as one-click connections (for example Supabase for data and auth, Stripe for payments)
- Code download and one-click deploy

**UX and flows:**
- Prompt or template → a set of generated screens shown together, then a chat to refine them
- Thinks in whole screen sets rather than single components
- The mobile preview is front and centre for Flutter apps

**Where users get stuck:**
- Apps start from templates, so unusual workflows take many follow-up prompts to bend into shape
- The AI inside the generated app is thin: it builds apps, not agents with tools, knowledge, guardrails and evals
- Little visibility into what changed between versions

**What Architect 2.0 takes:**
- Starting from something concrete: templates, a screenshot or PDF, and your brand's design tokens
- Planning the screens of an app together, as one plan

**What Architect 2.0 avoids:**
- Locking the user into a template's shape: the plan card is editable before anything is built
- Treating AI as a feature bolted onto an app: here the agent is the core, with a canvas, a trace and evals

---

### Cursor

**Product position:** AI-native IDE for professional developers.

**Feature list:**
- VS Code fork with AI features built in (Tab completion, Ctrl+K inline edit, Composer for multi-file edits)
- Works in local repos; reads the full codebase for context (@ references)
- Agent mode: autonomous multi-file changes with terminal access
- Works with any language or framework
- No hosted preview; no deploy flow; no agent canvas; no non-technical user path

**UX and flows:**
- It's an IDE: file tree, editor, terminal, git panel
- AI features are additive to the existing VS Code workflow
- Composer (multi-file agent): describe the change → model proposes a diff → user reviews and applies
- `@codebase` includes the full repo in context; `@file` pins a specific file

**Where users get stuck:**
- Non-developers cannot use it; there is no alternative mental model
- Composer changes can be hard to review in large codebases (thousands of lines changed at once)
- No visual preview of what was built

**What Architect 2.0 takes:**
- The "import a repo and make targeted changes as a diff" contract, adapted as the GitHub import → PR flow
- The idea of referencing specific files in the prompt context

**What Architect 2.0 avoids:**
- Cursor is a developer tool; Architect adds a visual product layer (preview, agent canvas, Guided mode) that makes the same repo accessible to non-technical teammates

---

### Claude Code / Codex

**Product position:** agentic coding in the terminal or a browser-based cloud environment.

**Feature list (Claude Code):**
- Runs in the terminal; reads and edits local files autonomously
- Deep context: full repo, git history, test output
- Multi-file changes with a review step before applying
- MCP server integration for external tools
- No visual preview; no deploy; no non-technical user path

**Feature list (Codex):**
- Browser-based (codex.openai.com); forks a GitHub repo into a cloud sandbox
- Prompt → PR: runs the change, runs tests, opens a pull request
- No local setup; shareable PR link
- Same developer-only audience

**UX and flows (Claude Code):**
- Terminal: `claude "add error handling to the auth middleware"` → model reads files → proposes changes → user accepts
- `/review` command shows a diff of all proposed changes before any file is written
- Hooks: pre-commit, post-edit, etc.

**UX and flows (Codex):**
- Paste a GitHub repo URL → describe the task → Codex runs in a sandbox → opens a PR with the diff

**Where users get stuck:**
- Both tools assume fluency with code and git
- No visual preview (you see a diff, not a running app)
- No agent canvas; no knowledge files; no non-technical colleague can contribute

**What Architect 2.0 takes:**
- The "work in your repo, ship a PR" contract as the Pro + GitHub import flow
- The idea of a review step before changes are applied (Architect's plan card is the equivalent)

**What Architect 2.0 avoids:**
- Terminal-only UX; Architect wraps the same contract in a visual product layer

---

## Gaps Architect 2.0 fills

1. **No tool serves mixed-skill teams on one project** → the Guided ⇄ Pro switch.
2. **Beginner tools break silently** → plan approval, checkpoints, auto-fix, "what changed".
3. **Agents are an afterthought in app builders** → a first-class agent canvas with a test trace and guardrails.
4. **Pro tools don't give business users visibility** → a shared plan, preview and agent view over the same code.
5. **Lock-in anxiety** → GitHub import, push, and pull requests from day one.
6. **Framework choice is binary** → six framework targets in the code export; engineers take what they need.
7. **No plan before build** → every builder requires intent approval before generating any code.
