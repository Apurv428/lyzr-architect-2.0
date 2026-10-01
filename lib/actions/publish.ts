"use server";

import { generateCode, FRAMEWORK_LANG } from "@/lib/agent/codegen";
import { compileAgent } from "@/lib/agent/compile";
import type { AgentGraph } from "@/lib/agent/types";
import type { FileMap } from "@/lib/ai/schema";
import { GitHubError, gh, githubToken } from "@/lib/github";
import { track } from "@/lib/analytics";
import { commitMessage, prBranch, prConventions } from "@/lib/git-agent";
import type { ImportData } from "@/lib/import-project";
import { getUser } from "@/lib/supabase/server";
import { changedSinceImport, IMPORT_LABEL } from "@/lib/workspace/import";
import { withRuntime } from "@/lib/workspace/sandbox";

export type PublishFile = { path: string; content: string };

type Imported = { baseline: FileMap; added: string[] };

async function loadProject(projectId: string) {
  const { supabase } = await getUser();
  const [{ data: project }, { data: checkpoint }, { data: agent }, { data: importCheckpoint }, { data: importMessage }] = await Promise.all([
    supabase.from("projects").select("id, name, prompt, github_repo, github_branch").eq("id", projectId).single(),
    supabase.from("checkpoints").select("files, label").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("agents").select("name, framework, graph").eq("project_id", projectId).limit(1).maybeSingle(),
    supabase.from("checkpoints").select("files").eq("project_id", projectId).eq("label", IMPORT_LABEL).order("created_at").limit(1).maybeSingle(),
    supabase.from("messages").select("data").eq("project_id", projectId).eq("kind", "checkpoint").not("data->import", "is", null).limit(1).maybeSingle(),
  ]);
  const imported: Imported | null = importCheckpoint
    ? { baseline: importCheckpoint.files as FileMap, added: (importMessage?.data as ImportData | null)?.import.added ?? [] }
    : null;
  return { supabase, project, checkpoint, agent, imported };
}

function agentFile(agent: { name: string; framework: string; graph: AgentGraph }): PublishFile {
  const ext = FRAMEWORK_LANG[agent.framework] === "json" ? "json" : "py";
  return { path: `architect/agent/${agent.framework}.${ext}`, content: generateCode(compileAgent(agent.graph, agent.name), agent.framework) };
}

function buildFiles(
  project: { name: string; prompt: string | null; github_repo: string | null },
  files: FileMap,
  agent: { name: string; framework: string; graph: AgentGraph } | null,
  imported: Imported | null,
): PublishFile[] {
  // An imported project keeps its own layout: files go back at their real paths. Into the repo it
  // came from, only what changed since the import; into a new repo, the whole project.
  if (imported) {
    const current = withRuntime(files);
    const out = project.github_repo
      ? changedSinceImport(imported.baseline, current, imported.added)
      : Object.entries(current)
          .filter(([path, content]) => !(imported.added.includes(path) && imported.baseline[path] === content))
          .map(([path, content]) => ({ path: path.slice(1), content }));
    return agent ? [...out, agentFile(agent)] : out;
  }

  // Apps that post to Slack import the platform helper, so it ships with them.
  const out: PublishFile[] = Object.entries(withRuntime(files)).map(([path, content]) => ({ path: `architect/app${path}`, content }));
  if (agent) out.push(agentFile(agent));
  out.push({
    path: "architect/README.md",
    content: `# ${project.name}\n\nGenerated with **Architect 2.0**.\n\n> ${project.prompt ?? ""}\n\n## Contents\n\n- \`app/\` — React + Tailwind UI (entry: \`app/App.tsx\`)\n${agent ? `- \`agent/\` — ${agent.name} starter for ${agent.framework}\n` : ""}\nEvery file here was reviewed as a checkpoint in Architect before being pushed.\n`,
  });
  return out;
}

export async function previewPublish(projectId: string) {
  const { project, checkpoint, agent, imported } = await loadProject(projectId);
  if (!project || !checkpoint) return { error: "Build the app first — there's nothing to push yet." };
  const files = buildFiles(project, checkpoint.files as FileMap, agent as never, imported);
  return {
    repo: project.github_repo as string | null,
    branch: project.github_branch as string | null,
    label: checkpoint.label as string,
    files: files.map((f) => ({ path: f.path, lines: f.content.split("\n").length })),
    connected: Boolean(await githubToken()),
  };
}

async function commitFiles(repo: string, baseBranch: string, headBranch: string | null, files: PublishFile[], message: string, token: string) {
  const base = await gh<{ object: { sha: string } }>(`/repos/${repo}/git/ref/heads/${encodeURIComponent(baseBranch)}`, token);
  const baseCommit = await gh<{ tree: { sha: string } }>(`/repos/${repo}/git/commits/${base.object.sha}`, token);
  const tree = await gh<{ sha: string }>(`/repos/${repo}/git/trees`, token, {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseCommit.tree.sha,
      tree: files.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: f.content })),
    }),
  });
  const commit = await gh<{ sha: string }>(`/repos/${repo}/git/commits`, token, {
    method: "POST",
    body: JSON.stringify({ message, tree: tree.sha, parents: [base.object.sha] }),
  });
  if (headBranch) {
    await gh(`/repos/${repo}/git/refs`, token, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${headBranch}`, sha: commit.sha }) });
  } else {
    await gh(`/repos/${repo}/git/refs/heads/${encodeURIComponent(baseBranch)}`, token, { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });
  }
  return commit.sha;
}

export async function publishToGitHub(projectId: string, input: { title: string; body: string; repoName?: string; isPrivate?: boolean }) {
  const token = await githubToken();
  if (!token) return { error: "Connect GitHub first." };
  const { supabase, project, checkpoint, agent, imported } = await loadProject(projectId);
  if (!project || !checkpoint) return { error: "Build the app first — there's nothing to push yet." };
  const files = buildFiles(project, checkpoint.files as FileMap, agent as never, imported);
  if (!files.length) return { error: "Nothing has changed since the import — make a change first." };

  // GitAgent conventions (Pro → Agent → GitAgent) shape the branch, commit and description.
  const git = (agent?.graph as AgentGraph | undefined)?.git;
  const message = commitMessage(git, input.title, files.slice(0, 12).map((f) => `Update ${f.path}`));
  const body = [input.body.trim(), prConventions(git)].filter(Boolean).join("\n\n");

  try {
    if (project.github_repo) {
      // Existing repo: new branch + one commit + pull request.
      const repo = project.github_repo as string;
      const baseBranch = (project.github_branch as string | null) ?? (await gh<{ default_branch: string }>(`/repos/${repo}`, token)).default_branch;
      const head = prBranch(git, project.name);
      await commitFiles(repo, baseBranch, head, files, message, token);
      const pr = await gh<{ html_url: string; number: number }>(`/repos/${repo}/pulls`, token, {
        method: "POST",
        body: JSON.stringify({ title: input.title, head, base: baseBranch, body }),
      });
      await track(supabase, "pr_opened", { kind: "pr" }, projectId);
      return { url: pr.html_url, kind: "pr" as const, label: `PR #${pr.number}` };
    }

    // New repo: create it, then commit on its default branch.
    const name = (input.repoName || project.name).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "architect-app";
    const repo = await gh<{ full_name: string; html_url: string; default_branch: string }>("/user/repos", token, {
      method: "POST",
      body: JSON.stringify({ name, private: input.isPrivate ?? true, auto_init: true, description: project.prompt?.slice(0, 200) ?? undefined }),
    });
    await commitFiles(repo.full_name, repo.default_branch, null, files, message, token);
    await supabase.from("projects").update({ github_repo: repo.full_name, github_branch: repo.default_branch }).eq("id", projectId);
    await track(supabase, "pr_opened", { kind: "repo" }, projectId);
    return { url: repo.html_url, kind: "repo" as const, label: repo.full_name };
  } catch (err) {
    return { error: err instanceof GitHubError ? err.message : "GitHub push failed." };
  }
}
