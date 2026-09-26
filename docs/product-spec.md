# Architect 2.0: Product Spec

## Problem statement
Teams want AI agents that do real work: triaging tickets, qualifying leads, answering from internal docs. Today they have to pick between tools that are easy but shallow and tools that are powerful but assume engineering skill. Neither lets a business owner and an engineer collaborate on the *same* agent.

## Target users

| Persona | Example | Job to be done | Fears | What Architect gives them |
|---|---|---|---|---|
| **Priya, ops manager** (non-technical) | Wants a ticket-triage agent with a dashboard | "Get a working tool without waiting on engineering" | Breaking things, jargon, cost surprises | Templates, plan approval, friendly agent blocks, checkpoints, one-click deploy |
| **Arjun, founder** (semi-technical) | Prototyping an AI SaaS MVP | "Show investors a working demo this week" | Stalling at 80% done | Prompt → app, select-to-edit, share link + QR |
| **Meera, full-stack / ML engineer** | Adding an agent to an existing Next.js repo | "Scaffold agent infrastructure fast, keep control" | Lock-in, black-box code, the wrong framework | GitHub import, framework choice, diffs, env vars, PRs, traces |

## Principles
1. **Plan before build.** Approval gates every build.
2. **Never stuck.** Checkpoints, non-destructive restore, auto-fix.
3. **Explain, don't hide.** Change summaries for everyone; diffs for Pro users.
4. **Agents are first-class.** Canvas, test console and trace, not an afterthought.
5. **Own your code.** Import, push, pull requests.

## Key decisions and trade-offs

| Decision | Why | Trade-off accepted |
|---|---|---|
| One project with a Guided/Pro switch, not two products | Skill varies by task; mixed-skill teams share one artifact | More UI states to design for each surface |
| Plan card before any code | Builds trust, cuts wasted generations, gives a natural edit point | One extra click for power users |
| In-browser sandbox (React + Tailwind) for generated apps | Instant, reliable preview with no infrastructure per app | No real backend per generated app in this version |
| Deploy = frozen checkpoint snapshot | Deterministic, instant rollback | No server-side runtime for deployed apps yet |
| Real web search, simulated business tools | Shows real agent behaviour without OAuth setup for every integration | Simulated tools are clearly labelled |
| Rules + PII redaction enforced after the model replies | Guarantees the rule holds even if the model slips | Regex coverage, not a classifier |

## Success metrics
- **North star:** weekly deployed agentic apps.
- **Activation:** % of signups with a working preview within 5 minutes.
- **Quality:** plan approval rate; restores per project; auto-fix success rate.
- **Depth:** % of projects that test the agent; Guided → Pro switches; share of imports among Pro users.
- **Retention:** 7-day and 28-day returning builders.

## Out of scope for this version → roadmap
1. Full-stack runtimes (E2B / WebContainers) and multi-file backends.
2. Real OAuth connectors behind the simulated tools.
3. Multi-agent orchestration, evals as test suites, public agent API with keys.
4. Team workspaces, roles, preview comments, SSO, audit logs.
