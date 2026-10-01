import { afterEach, describe, expect, it, vi } from "vitest";
import { dataModelCsv, reportMarkdown } from "@/lib/artifacts";
import { generateCode } from "@/lib/agent/codegen";
import { compileAgent } from "@/lib/agent/compile";
import { simulateTool, toolInputSchema } from "@/lib/agent/run";
import { graphFromPlan } from "@/lib/agent/seed";
import { TOOL_CATALOG, type AgentGraph } from "@/lib/agent/types";
import { compatibleHost } from "@/lib/ai/provider";
import { PlanSchema } from "@/lib/ai/schema";
import { parseDesignTokens, tokensForPrompt } from "@/lib/design-tokens";
import { commitMessage, prBranch, prConventions } from "@/lib/git-agent";

vi.mock("@/lib/webhooks", () => ({ validateForwardUrl: async (url: string) => ({ ok: true, url }) }));

const plan = PlanSchema.parse({
  summary: "Triage support tickets and draft replies.",
  screens: ["Inbox: incoming tickets", "Ticket: one ticket with the draft reply"],
  data: [{ entity: "Ticket", fields: ["id", "subject", "urgency"] }],
  agent: { name: "Triage", goal: "Sort tickets by urgency", steps: ["Read the ticket", "Draft a reply"], tools: ["Notion", "Jira tickets"] },
  rules: ["Never promise refunds"],
  assumptions: ["English only"],
});

describe("design tokens", () => {
  it("reads CSS variables, including shadcn-style HSL channels and var() references", () => {
    const tokens = parseDesignTokens(
      `:root { --brand: #4f46e5; --primary: var(--brand); --background: 0 0% 100%; --font-sans: "Inter", system-ui; --radius: 0.75rem; --spacing: 4px; }`,
      "brand.css",
    );
    expect(tokens.colors).toEqual([
      { name: "brand", value: "#4f46e5" },
      { name: "primary", value: "#4f46e5" },
      { name: "background", value: "hsl(0 0% 100%)" },
    ]);
    expect(tokens.fonts).toEqual(["Inter"]);
    expect(tokens.radius).toBe("0.75rem");
  });

  it("reads W3C design-token JSON", () => {
    const tokens = parseDesignTokens(JSON.stringify({ color: { brand: { primary: { $type: "color", $value: "#0ea5e9" } } }, font: { family: { body: { $value: ["Geist", "sans-serif"] } } } }), "tokens.json");
    expect(tokens.colors).toEqual([{ name: "color-brand-primary", value: "#0ea5e9" }]);
    expect(tokens.fonts).toEqual(["Geist"]);
  });

  it("explains when nothing usable is found, and builds the prompt line", () => {
    expect(() => parseDesignTokens("body { margin: 0 }", "x.css")).toThrow(/No colours/);
    const line = tokensForPrompt(parseDesignTokens(":root{--primary:#111827}", "x.css"));
    expect(line).toContain("primary #111827");
    expect(tokensForPrompt(null)).toBe("");
  });
});

describe("GitAgent conventions", () => {
  it("names branches from the prefix and project", () => {
    expect(prBranch({ branchPrefix: "bots/" }, "Support Desk!", 0)).toBe("bots/support-desk-0");
    expect(prBranch({ branchPrefix: "agent" }, "x", 0)).toBe("agent/x-0");
  });

  it("formats commit messages in the chosen style", () => {
    expect(commitMessage({ commitStyle: "conventional" }, "Add a support agent")).toBe("feat: add a support agent");
    expect(commitMessage({ commitStyle: "conventional" }, "fix: typo")).toBe("fix: typo");
    expect(commitMessage({ commitStyle: "descriptive" }, "Add agent", ["Update App.tsx"])).toBe("Add agent\n\n- Update App.tsx");
  });

  it("adds rules, skills and identity to the pull request", () => {
    const footer = prConventions({ rules: ["Never commit to main"], skills: ["Write tests"], identity: "Architect bot" });
    expect(footer).toContain("- Never commit to main");
    expect(footer).toContain("Opened by Architect bot via Architect.");
    expect(prConventions({ rules: [], skills: [], identity: " " })).toBe("");
  });
});

describe("artifacts", () => {
  it("are built from the project's real plan and agent", () => {
    const agent = { name: "Triage", graph: graphFromPlan(plan, "Triage") };
    const report = reportMarkdown({ name: "Support desk", plan, agent, files: { "/App.tsx": "" } });
    expect(report).toContain("| Inbox | incoming tickets |");
    expect(report).toContain("Never promise refunds");
    expect(report).toContain("`/App.tsx`");
    expect(dataModelCsv({ name: "x", plan, files: {} })).toBe("record,field\nTicket,id\nTicket,subject\nTicket,urgency");
  });
});

describe("tool catalog", () => {
  it("gives every catalog tool a schema, a simulated result and a code stub", () => {
    for (const t of TOOL_CATALOG) {
      if (t.id === "web_search") continue;
      expect(toolInputSchema(t.id), t.id).toBeDefined();
      expect(simulateTool(t.id, { action: "create", details: "test" }), t.id).not.toContain("Unknown tool");
    }
    const graph = graphFromPlan(plan, "Triage");
    expect(graph.nodes.map((n) => n.data.config.tool).filter(Boolean)).toEqual(["notion", "jira"]);
    expect(generateCode(compileAgent(graph, "Triage"), "langgraph")).toContain("def notion(action: str, details: str) -> str:");
  });
});

describe("MCP blocks", () => {
  const graph: AgentGraph = {
    nodes: [
      { id: "llm", type: "agent", position: { x: 0, y: 0 }, data: { kind: "llm", label: "Brain", config: { model: "claude-opus-5", instructions: "Help." } } },
      { id: "mcp", type: "agent", position: { x: 0, y: 0 }, data: { kind: "mcp", label: "Docs", config: { serverUrl: "https://mcp.example.com/mcp", authToken: "secret", description: "Company docs" } } },
      { id: "loose", type: "agent", position: { x: 0, y: 0 }, data: { kind: "mcp", label: "Unconnected", config: { serverUrl: "https://other.example.com", authToken: "", description: "" } } },
    ],
    edges: [{ id: "e", source: "llm", target: "mcp" }],
  };

  it("compile only connected servers, and never put the token in exported code", () => {
    const spec = compileAgent(graph, "Agent");
    expect(spec.mcpServers).toEqual([{ nodeId: "mcp", url: "https://mcp.example.com/mcp", token: "secret", description: "Company docs" }]);
    for (const fw of ["langgraph", "crewai", "openai-agents", "claude-agent-sdk", "google-adk", "lyzr-adk"]) expect(generateCode(spec, fw)).not.toContain("secret");
  });

  afterEach(() => vi.unstubAllGlobals());

  it("speak the MCP handshake, then list and call tools (JSON and SSE replies)", async () => {
    const calls: { method: string; session: string | null; auth: string | null }[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const headers = init.headers as Record<string, string>;
      calls.push({ method: body.method, session: headers["Mcp-Session-Id"] ?? null, auth: headers.Authorization ?? null });
      if (body.method === "initialize") return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-06-18" } }), { headers: { "content-type": "application/json", "mcp-session-id": "s-1" } });
      if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
      if (body.method === "tools/list") {
        const sse = `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { tools: [{ name: "search_docs", description: "Search", inputSchema: { type: "object", properties: { q: { type: "string" } } } }] } })}\n\n`;
        return new Response(sse, { headers: { "content-type": "text/event-stream" } });
      }
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: `Found: ${body.params.arguments.q}` }] } }), { headers: { "content-type": "application/json" } });
    });
    const { McpSession, mcpToolName } = await import("@/lib/agent/mcp");
    const session = await McpSession.connect("https://mcp.example.com/mcp", "tok");
    const tools = await session.listTools();
    expect(tools.map((t) => t.name)).toEqual(["search_docs"]);
    expect(await session.callTool("search_docs", { q: "refunds" })).toEqual({ text: "Found: refunds", isError: false });
    expect(calls.map((c) => c.method)).toEqual(["initialize", "notifications/initialized", "tools/list", "tools/call"]);
    expect(calls.slice(1).every((c) => c.session === "s-1" && c.auth === "Bearer tok")).toBe(true);
    expect(mcpToolName(0, "search docs!")).toBe("mcp0__search_docs_");
  });
});

describe("model choice", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("runs Gemini on its own key or on a platform key that already points at Gemini", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "platform");
    vi.stubEnv("OPENAI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai/");
    expect(compatibleHost("gemini")?.apiKey).toBe("platform");
    vi.stubEnv("OPENAI_BASE_URL", "");
    expect(compatibleHost("gemini")).toBeNull();
    vi.stubEnv("GEMINI_API_KEY", "g-key");
    expect(compatibleHost("gemini")).toMatchObject({ apiKey: "g-key", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/" });
  });

  it("runs Llama on any OpenAI-compatible host", () => {
    expect(compatibleHost("llama")).toBeNull();
    vi.stubEnv("LLAMA_BASE_URL", "http://localhost:11434/v1");
    expect(compatibleHost("llama")).toMatchObject({ baseURL: "http://localhost:11434/v1", apiKey: "none" });
  });

  it("generates code with the right SDK for each model family", () => {
    const spec = (model: string) => compileAgent({ nodes: [{ id: "l", type: "agent", position: { x: 0, y: 0 }, data: { kind: "llm", label: "B", config: { model, instructions: "Hi" } } }], edges: [] }, "A");
    expect(generateCode(spec("gemini"), "langgraph")).toContain("ChatGoogleGenerativeAI(model=\"gemini-2.5-flash\")");
    expect(generateCode(spec("llama"), "langgraph")).toContain('base_url=os.environ["LLAMA_BASE_URL"]');
    expect(generateCode(spec("llama"), "crewai")).toContain('llm="groq/llama-3.3-70b-versatile"');
    expect(generateCode(spec("gemini"), "claude-agent-sdk")).toContain('model="claude-sonnet-5"');
    expect(generateCode(spec("gpt-5.5"), "langgraph")).toContain('ChatOpenAI(model="gpt-5.5")');
  });
});
