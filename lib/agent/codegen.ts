import { systemPrompt, type AgentSpec } from "./compile";
import { TOOL_CATALOG } from "./types";

const py = (s: string) => JSON.stringify(s);
// Multi-line prompts read better as triple-quoted Python strings.
const pyBlock = (s: string) => `"""\n${s.replace(/\\/g, "\\\\").replace(/"""/g, '\\"\\"\\"')}\n"""`;
const ident = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "agent";

const TOOL_STUBS: Record<string, { fn: string; doc: string; args: string }> = {
  send_email: { fn: "send_email", doc: "Send an email to a recipient.", args: "to: str, subject: str, body: str" },
  slack_message: { fn: "post_to_slack", doc: "Post a message to a Slack channel.", args: "channel: str, text: str" },
  crm_lookup: { fn: "crm_lookup", doc: "Look up a customer or lead in the CRM.", args: "query: str" },
  create_ticket: { fn: "create_ticket", doc: "Create a ticket in the helpdesk.", args: "title: str, description: str, priority: str" },
  sql_query: { fn: "query_database", doc: "Run a read-only SQL query.", args: "sql: str" },
  http_request: { fn: "http_request", doc: "Call an external REST API.", args: "method: str, url: str, body: str = ''" },
};

/** The Python stub for a tool: a hand-written one, or a generic one for other catalog tools. Web search is built in. */
function stubFor(id: string) {
  if (TOOL_STUBS[id]) return TOOL_STUBS[id];
  const meta = TOOL_CATALOG.find((t) => t.id === id);
  return id === "web_search" || !meta ? undefined : { fn: id, doc: `${meta.description}.`, args: "action: str, details: str" };
}

function customTools(spec: AgentSpec, decorator: string) {
  return spec.tools
    .flatMap((t) => {
      const s = stubFor(t);
      return s ? [`${decorator ? decorator + "\n" : ""}def ${s.fn}(${s.args}) -> str:\n    """${s.doc}"""\n    raise NotImplementedError("Connect your ${t.replaceAll("_", " ")} integration")\n`] : [];
    })
    .join("\n");
}

const toolNames = (spec: AgentSpec) => spec.tools.flatMap((t) => stubFor(t)?.fn ?? []);

export const FRAMEWORK_LANG: Record<string, string> = {
  "lyzr-adk": "json",
  langgraph: "python",
  crewai: "python",
  "openai-agents": "python",
  "claude-agent-sdk": "python",
  "google-adk": "python",
};

// Concrete model ids for the canvas choices that name a family rather than a version.
const FAMILY_MODEL: Record<string, string> = { gemini: "gemini-2.5-flash", llama: "llama-3.3-70b-versatile" };

/** The model family and the id frameworks expect for it. */
function modelInfo(model: string) {
  const family = model.startsWith("gpt") ? "openai" : model === "gemini" ? "gemini" : model === "llama" ? "llama" : "anthropic";
  return { family, id: FAMILY_MODEL[model] ?? model };
}

/** LangChain chat model: package, import line and constructor for the agent's model. */
function langchainModel(model: string) {
  const { family, id } = modelInfo(model);
  switch (family) {
    case "openai":
      return { pkg: "langchain-openai", imports: "from langchain_openai import ChatOpenAI", ctor: `ChatOpenAI(model=${py(id)})` };
    case "gemini":
      return { pkg: "langchain-google-genai", imports: "from langchain_google_genai import ChatGoogleGenerativeAI", ctor: `ChatGoogleGenerativeAI(model=${py(id)})` };
    case "llama":
      // Any OpenAI-compatible Llama host (Groq, Together, OpenRouter, Ollama).
      return { pkg: "langchain-openai", imports: "import os\nfrom langchain_openai import ChatOpenAI", ctor: `ChatOpenAI(model=${py(id)}, base_url=os.environ["LLAMA_BASE_URL"], api_key=os.environ["LLAMA_API_KEY"])` };
    default:
      return { pkg: "langchain-anthropic", imports: "from langchain_anthropic import ChatAnthropic", ctor: `ChatAnthropic(model=${py(id)})` };
  }
}

/** LiteLLM-style model string, as CrewAI expects. */
function litellmModel(model: string) {
  const { family, id } = modelInfo(model);
  return family === "llama" ? `groq/${id}` : `${family}/${id}`;
}

export function generateCode(spec: AgentSpec, framework: string): string {
  const prompt = systemPrompt(spec);
  const name = ident(spec.name);
  const names = toolNames(spec);
  const lc = langchainModel(spec.model);

  switch (framework) {
    case "langgraph":
      return `# pip install langgraph ${lc.pkg}
${lc.imports}
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent

${customTools(spec, "@tool")}
SYSTEM_PROMPT = ${pyBlock(prompt)}

${name} = create_react_agent(
    model=${lc.ctor},
    tools=[${names.join(", ")}],
    prompt=SYSTEM_PROMPT,
)

if __name__ == "__main__":
    result = ${name}.invoke({"messages": [("user", "Hello!")]})
    print(result["messages"][-1].content)
`;
    case "crewai":
      return `# pip install crewai
from crewai import Agent, Crew, Task
from crewai.tools import tool

${customTools(spec, '@tool')}
${name} = Agent(
    role=${py(spec.name)},
    goal=${py(spec.instructions.split("\n")[0])},
    backstory=${pyBlock(prompt)},
    llm=${py(litellmModel(spec.model))},
    tools=[${names.join(", ")}],
)

task = Task(
    description="{request}",
    expected_output=${py(spec.output)},
    agent=${name},
)

crew = Crew(agents=[${name}], tasks=[task])

if __name__ == "__main__":
    print(crew.kickoff(inputs={"request": "Hello!"}))
`;
    case "openai-agents":
      return `# pip install openai-agents
from agents import Agent, Runner, function_tool

${customTools(spec, "@function_tool")}
${name} = Agent(
    name=${py(spec.name)},
    instructions=${pyBlock(prompt)},${spec.model.startsWith("gpt") ? `\n    model=${py(spec.model)},` : ""}
    tools=[${names.join(", ")}],
)

if __name__ == "__main__":
    result = Runner.run_sync(${name}, "Hello!")
    print(result.final_output)
`;
    case "claude-agent-sdk":
      return `# pip install claude-agent-sdk
import asyncio
from claude_agent_sdk import ClaudeAgentOptions, query

options = ClaudeAgentOptions(
    model=${py(modelInfo(spec.model).family === "anthropic" ? spec.model : "claude-sonnet-5")},  # the Claude Agent SDK runs Claude models
    system_prompt=${pyBlock(prompt)},
    allowed_tools=[${spec.tools.includes("web_search") ? '"WebSearch"' : ""}],
)

async def main():
    async for message in query(prompt="Hello!", options=options):
        print(message)

asyncio.run(main())
`;
    case "google-adk":
      return `# pip install google-adk
from google.adk.agents import Agent

${customTools(spec, "")}
root_agent = Agent(
    name=${py(name)},
    model="gemini-2.5-pro",  # or a LiteLLM-wrapped Claude model
    instruction=${pyBlock(prompt)},
    tools=[${names.join(", ")}],
)
`;
    default:
      return JSON.stringify(
        {
          blueprint: "lyzr-agent-studio",
          name: spec.name,
          model: spec.model,
          trigger: spec.trigger,
          instructions: spec.instructions,
          tools: spec.tools,
          knowledge_base: spec.knowledge ? { type: "text", chars: spec.knowledge.length } : null,
          memory: spec.memory,
          responsible_ai: { rules: spec.rules, pii_redaction: spec.redactPII },
          output: spec.output,
        },
        null,
        2,
      );
  }
}
