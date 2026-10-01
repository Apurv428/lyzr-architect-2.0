"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { GH_COOKIE, GitHubError, fetchRepoFiles, gh, githubCookie, githubToken, inspectRepo, parseRepo, type RepoSummary } from "@/lib/github";
import { createImportedProject } from "@/lib/import-project";
import { getUser } from "@/lib/supabase/server";

export type RepoListItem = { fullName: string; description: string | null; isPrivate: boolean; language: string | null; updatedAt: string };

const fail = (err: unknown) => ({ error: err instanceof GitHubError ? err.message : "Couldn't reach GitHub. Try again." });

export async function githubStatus() {
  const token = await githubToken();
  if (!token) return { connected: false as const };
  try {
    const me = await gh<{ login: string; avatar_url: string }>("/user", token);
    return { connected: true as const, login: me.login, avatar: me.avatar_url };
  } catch {
    return { connected: false as const };
  }
}

export async function saveGithubToken(token: string) {
  const value = token.trim();
  if (!/^(gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}$/.test(value)) return { error: "That doesn't look like a GitHub token." };
  try {
    const me = await gh<{ login: string }>("/user", value);
    (await cookies()).set(githubCookie(value));
    return { login: me.login };
  } catch (err) {
    return fail(err);
  }
}

export async function disconnectGithub() {
  (await cookies()).delete(GH_COOKIE);
}

export async function listRepos(): Promise<{ repos: RepoListItem[] } | { error: string }> {
  const token = await githubToken();
  if (!token) return { error: "Connect GitHub to see your repositories." };
  try {
    const repos = await gh<{ full_name: string; description: string | null; private: boolean; language: string | null; pushed_at: string }[]>(
      "/user/repos?sort=pushed&per_page=60&affiliation=owner,collaborator,organization_member",
      token,
    );
    return {
      repos: repos.map((r) => ({ fullName: r.full_name, description: r.description, isPrivate: r.private, language: r.language, updatedAt: r.pushed_at })),
    };
  } catch (err) {
    return fail(err);
  }
}

export async function analyzeRepo(input: string, branch?: string): Promise<{ summary: RepoSummary } | { error: string }> {
  const fullName = parseRepo(input);
  if (!fullName) return { error: "Enter a repository like owner/name or a github.com URL." };
  try {
    return { summary: await inspectRepo(fullName, await githubToken(), branch) };
  } catch (err) {
    return fail(err);
  }
}

export async function importRepo(summary: RepoSummary, goal: string) {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  const prompt = goal.trim();
  if (!prompt) return { error: "Tell Architect what to add to this repo." };

  // Bring the repo's own source in, so the project keeps working on the real code.
  let imported: { files: Record<string, string>; skipped: number };
  try {
    imported = await fetchRepoFiles(summary.fullName, summary.branch, await githubToken());
  } catch (err) {
    return fail(err);
  }
  const count = Object.keys(imported.files).length;

  const description = [
    `Imported from GitHub: ${summary.fullName}@${summary.branch} (${summary.fileCount} files; ${count} loaded into Architect).`,
    summary.stack.length ? `Stack: ${summary.stack.join(", ")}.` : "",
    summary.agentLibs.length ? `Existing AI libraries: ${summary.agentLibs.join(", ")}.` : "No AI libraries yet.",
    `Languages: ${summary.languages.map((l) => `${l.name} ${l.share}%`).join(", ")}.`,
    `Top-level: ${summary.rootEntries.join(", ")}.`,
  ]
    .filter(Boolean)
    .join(" ");

  const res = await createImportedProject(supabase, {
    name: summary.fullName.split("/")[1],
    description,
    prompt,
    mode: "pro",
    framework: summary.suggestedFramework,
    githubRepo: summary.fullName,
    githubBranch: summary.branch,
    source: "github",
    files: imported.files,
    skipped: imported.skipped,
    summary: `Imported ${summary.fullName} · ${summary.branch} · ${count} of ${summary.fileCount} files`,
  });
  if ("error" in res) return res;
  redirect(`/p/${res.id}`);
}
