import "server-only";
import { cookies } from "next/headers";
import { decrypt, encrypt } from "@/lib/crypto";
import { pickImportFiles } from "@/lib/workspace/import";

export const GH_COOKIE = "gh_token";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 30,
  path: "/",
};

/** The GitHub token is stored encrypted; a cookie that fails to decrypt counts as disconnected. */
export async function githubToken() {
  return decrypt((await cookies()).get(GH_COOKIE)?.value);
}

export function githubCookie(token: string) {
  return { name: GH_COOKIE, value: encrypt(token), ...COOKIE_OPTIONS };
}

export class GitHubError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function gh<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "architect-2",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    const hint =
      res.status === 404
        ? "Repository not found — check the name, or connect GitHub for private repos."
        : res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0"
          ? "GitHub rate limit reached — connect your GitHub account to continue."
          : res.status === 401
            ? "Your GitHub connection expired — reconnect GitHub."
            : body.message ?? `GitHub error ${res.status}`;
    throw new GitHubError(hint, res.status);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export function parseRepo(input: string) {
  const m = input.trim().match(/(?:github\.com[/:])?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/|$|#|\?)/i) ?? input.trim().match(/^([\w.-]+)\/([\w.-]+)$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

export type RepoSummary = {
  fullName: string;
  description: string | null;
  branch: string;
  isPrivate: boolean;
  stars: number;
  fileCount: number;
  stack: string[];
  agentLibs: string[];
  languages: { name: string; share: number }[];
  hasTests: boolean;
  rootEntries: string[];
  suggestedFramework: string;
  suggestions: string[];
};

const EXT_LANG: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript",
  py: "Python", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", rb: "Ruby", php: "PHP",
  cs: "C#", swift: "Swift", css: "CSS", scss: "CSS", html: "HTML", vue: "Vue", svelte: "Svelte", sql: "SQL",
};

const JS_STACK: [string, string][] = [
  ["next", "Next.js"], ["react", "React"], ["vue", "Vue"], ["svelte", "Svelte"], ["@angular/core", "Angular"],
  ["express", "Express"], ["@nestjs/core", "NestJS"], ["fastify", "Fastify"], ["hono", "Hono"],
  ["prisma", "Prisma"], ["@supabase/supabase-js", "Supabase"], ["tailwindcss", "Tailwind"], ["drizzle-orm", "Drizzle"],
];
const JS_AGENT: [string, string][] = [
  ["@anthropic-ai/sdk", "Anthropic SDK"], ["openai", "OpenAI SDK"], ["langchain", "LangChain"], ["@langchain/core", "LangChain"],
  ["@langchain/langgraph", "LangGraph"], ["ai", "Vercel AI SDK"], ["llamaindex", "LlamaIndex"], ["@openai/agents", "OpenAI Agents SDK"],
];
const PY_STACK: [string, string][] = [
  ["fastapi", "FastAPI"], ["flask", "Flask"], ["django", "Django"], ["streamlit", "Streamlit"], ["sqlalchemy", "SQLAlchemy"], ["pandas", "pandas"],
];
const PY_AGENT: [string, string][] = [
  ["anthropic", "Anthropic SDK"], ["openai", "OpenAI SDK"], ["langchain", "LangChain"], ["langgraph", "LangGraph"], ["crewai", "CrewAI"],
  ["llama-index", "LlamaIndex"], ["llama_index", "LlamaIndex"], ["openai-agents", "OpenAI Agents SDK"], ["google-adk", "Google ADK"],
  ["claude-agent-sdk", "Claude Agent SDK"], ["lyzr", "Lyzr"],
];

async function readFile(fullName: string, path: string, branch: string, token: string | null) {
  try {
    const f = await gh<{ content?: string; encoding?: string }>(`/repos/${fullName}/contents/${path}?ref=${encodeURIComponent(branch)}`, token);
    return f.content && f.encoding === "base64" ? Buffer.from(f.content, "base64").toString("utf8") : null;
  } catch {
    return null;
  }
}

/**
 * Downloads the repo's readable source (within IMPORT_LIMITS) so an imported project opens with its
 * real files. Raw downloads don't count against the API rate limit; private repos fall back to the
 * contents API when raw access is refused.
 */
export async function fetchRepoFiles(fullName: string, branch: string, token: string | null) {
  const tree = await gh<{ tree: { path: string; type: string; size?: number }[] }>(
    `/repos/${fullName}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    token,
  );
  const blobs = tree.tree.filter((t) => t.type === "blob");
  const { picked, skipped } = pickImportFiles(blobs.map((t) => ({ path: t.path, size: t.size ?? 0 })));
  const files: Record<string, string> = {};
  const queue = [...picked];
  const ref = branch.split("/").map(encodeURIComponent).join("/");
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let path = queue.shift(); path; path = queue.shift()) {
        const url = `https://raw.githubusercontent.com/${fullName}/${ref}/${path.split("/").map(encodeURIComponent).join("/")}`;
        const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" }).catch(() => null);
        const text = res?.ok ? await res.text() : await readFile(fullName, path, branch, token);
        if (text !== null) files[path] = text;
      }
    }),
  );
  return { files, skipped: skipped + (picked.length - Object.keys(files).length) };
}

export async function inspectRepo(fullName: string, token: string | null, branchOverride?: string): Promise<RepoSummary> {
  const repo = await gh<{ full_name: string; description: string | null; default_branch: string; private: boolean; stargazers_count: number }>(
    `/repos/${fullName}`,
    token,
  );
  const branch = branchOverride || repo.default_branch;
  const tree = await gh<{ tree: { path: string; type: string }[]; truncated: boolean }>(
    `/repos/${repo.full_name}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    token,
  );
  const files = tree.tree.filter((t) => t.type === "blob" && !/(^|\/)(node_modules|\.git|dist|build|\.next|vendor)\//.test(t.path));
  const paths = new Set(files.map((f) => f.path));

  const langCount = new Map<string, number>();
  for (const f of files) {
    const lang = EXT_LANG[f.path.split(".").pop()?.toLowerCase() ?? ""];
    if (lang) langCount.set(lang, (langCount.get(lang) ?? 0) + 1);
  }
  const totalLang = [...langCount.values()].reduce((a, b) => a + b, 0) || 1;
  const languages = [...langCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, n]) => ({ name, share: Math.round((n / totalLang) * 100) }));

  const stack = new Set<string>();
  const agentLibs = new Set<string>();
  if (paths.has("package.json")) {
    const pkg = JSON.parse((await readFile(repo.full_name, "package.json", branch, token)) ?? "{}") as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [dep, label] of JS_STACK) if (deps[dep]) stack.add(label);
    for (const [dep, label] of JS_AGENT) if (deps[dep]) agentLibs.add(label);
  }
  const pyManifest = ["requirements.txt", "pyproject.toml", "Pipfile"].find((p) => paths.has(p));
  if (pyManifest) {
    const text = ((await readFile(repo.full_name, pyManifest, branch, token)) ?? "").toLowerCase();
    stack.add("Python");
    for (const [dep, label] of PY_STACK) if (new RegExp(`(^|[\\s"'\\[])${dep}\\b`, "m").test(text)) stack.add(label);
    for (const [dep, label] of PY_AGENT) if (new RegExp(`(^|[\\s"'\\[])${dep}\\b`, "m").test(text)) agentLibs.add(label);
  }
  if (paths.has("Dockerfile")) stack.add("Docker");

  const agentList = [...agentLibs];
  const suggestedFramework = agentList.includes("LangGraph")
    ? "langgraph"
    : agentList.includes("CrewAI")
      ? "crewai"
      : agentList.includes("OpenAI Agents SDK")
        ? "openai-agents"
        : agentList.includes("Claude Agent SDK")
          ? "claude-agent-sdk"
          : agentList.includes("Google ADK")
            ? "google-adk"
            : "lyzr-adk";

  const stackList = [...stack];
  const suggestions = agentList.length
    ? ["Add evals and tracing to the existing agent", "Add guardrails for PII and off-topic requests", "Give the agent a knowledge base over /docs"]
    : stackList.some((s) => /Next|React|Vue|Svelte/.test(s))
      ? ["Add an in-app support chat agent", "Add an AI search bar over the app's content", "Summarise user activity with a weekly report agent"]
      : ["Add a RAG agent that answers questions about this codebase", "Add an API endpoint backed by an agent", "Add a scheduled report agent"];

  return {
    fullName: repo.full_name,
    description: repo.description,
    branch,
    isPrivate: repo.private,
    stars: repo.stargazers_count,
    fileCount: files.length,
    stack: stackList,
    agentLibs: agentList,
    languages,
    hasTests: files.some((f) => /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[jt]sx?$|test_.*\.py$/.test(f.path)),
    rootEntries: [...new Set(tree.tree.map((t) => t.path.split("/")[0]))].slice(0, 14),
    suggestedFramework,
    suggestions,
  };
}
