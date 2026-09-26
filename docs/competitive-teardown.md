# Competitive Teardown

Test brief used for every tool: *"Build a support-ticket triage agent with a dashboard."*

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

## Gaps Architect 2.0 fills
1. **No tool serves mixed-skill teams on one project** → the Guided ⇄ Pro switch.
2. **Beginner tools break silently** → plan approval, checkpoints, auto-fix, "what changed".
3. **Agents are an afterthought in app builders** → a first-class agent canvas with a test trace and guardrails.
4. **Pro tools don't give business users visibility** → a shared plan, preview and agent view over the same code.
5. **Lock-in anxiety** → GitHub import, push, and pull requests from day one.
