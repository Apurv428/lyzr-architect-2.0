import { DEFAULT_GIT_AGENT, type GitAgentSettings } from "@/lib/agent/types";

// Applies the GitAgent conventions (Pro → Agent → GitAgent) to the branch, commit and pull request.

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "changes";

/** A unique branch for one pull request, e.g. "architect/support-desk-lx3k9a". */
export function prBranch(git: Partial<GitAgentSettings> | undefined, projectName: string, now = Date.now()) {
  const prefix = (git?.branchPrefix ?? DEFAULT_GIT_AGENT.branchPrefix).replace(/[^\w./-]/g, "").replace(/^\/+/, "");
  const sep = !prefix || prefix.endsWith("/") || prefix.endsWith("-") ? "" : "/";
  return `${prefix}${sep}${slug(projectName)}-${now.toString(36)}`;
}

/** The commit message in the chosen style. */
export function commitMessage(git: Partial<GitAgentSettings> | undefined, title: string, changes: string[] = []) {
  const text = title.trim() || "Update from Architect";
  switch (git?.commitStyle ?? DEFAULT_GIT_AGENT.commitStyle) {
    case "conventional":
      return /^\w+(\(.+\))?!?: /.test(text) ? text : `feat: ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
    case "descriptive":
      return changes.length ? `${text}\n\n${changes.map((c) => `- ${c}`).join("\n")}` : text;
    default:
      return text;
  }
}

/** The section appended to the pull request description, or "" when nothing is set. */
export function prConventions(git: Partial<GitAgentSettings> | undefined) {
  if (!git) return "";
  const parts: string[] = [];
  if (git.rules?.length) parts.push(`**Rules followed**\n${git.rules.map((r) => `- ${r}`).join("\n")}`);
  if (git.skills?.length) parts.push(`**Skills applied**\n${git.skills.map((s) => `- ${s}`).join("\n")}`);
  if (git.identity?.trim()) parts.push(`Opened by ${git.identity.trim()} via Architect.`);
  return parts.length ? `---\n${parts.join("\n\n")}` : "";
}
