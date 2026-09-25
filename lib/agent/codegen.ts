import { systemPrompt, type AgentSpec } from "./compile";

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

function customTools(spec: AgentSpec, decorator: string) {
  return spec.tools
    .filter((t) => TOOL_STUBS[t])
    .map((t) => {
      const s = TOOL_STUBS[t];
      return `${decorator ? decorator + "\n" : ""}def ${s.fn}(${s.args}) -> str:\n    """${s.doc}"""\n    raise NotImplementedError("Connect your ${t.replace("_", " ")} integration")\n`;
    })
    .join("\n");
}

const toolNames = (spec: AgentSpec) => spec.tools.filter((t) => TOOL_STUBS[t]).map((t) => TOOL_STUBS[t].fn);

export const FRAMEWORK_LANG: Record<string, string> = {
  "lyzr-adk": "json",
  langgraph: "python",
  crewai: "python",
  "openai-agents": "python",
  "claude-agent-sdk": "python",
  "google-adk": "python",
};

export function generateCode(spec: AgentSpec, framework: string): string {
  const prompt = systemPrompt(spec);
  const name = ident(spec.name);
  const names = toolNames(spec);

  switch (framework) {
    case "langgraph":
      return `# pip install langgraph ${spec.model.startsWith("gpt") ? "langchain-openai" : "langchain-anthropic"}
${spec.model.startsWith("gpt") ? "from langchain_openai import ChatOpenAI" : "from langchain_anthropic import ChatAnthropic"}
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent

${customTools(spec, "@tool")}
SYSTEM_PROMPT = ${pyBlock(prompt)}

${name} = create_react_agent(
    model=${spec.model.startsWith("gpt") ? "ChatOpenAI" : "ChatAnthropic"}(model=${py(spec.model)}),
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
    llm=${py((spec.model.startsWith("gpt") ? "openai/" : "anthropic/") + spec.model)},
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
    model=${py(spec.model)},
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
