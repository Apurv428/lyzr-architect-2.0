export type DeployLog = { at: number; level: "info" | "success" | "warn"; text: string };

export type Deployment = {
  id: string;
  env: "preview" | "production";
  status: "queued" | "building" | "ready" | "failed" | "rolled_back";
  slug: string | null;
  label: string | null;
  is_current: boolean;
  created_at: string;
};

export type DeployEvent =
  | { t: "log"; log: DeployLog }
  | { t: "progress"; value: number }
  | { t: "ready"; deployment: Deployment; url: string }
  | { t: "error"; message: string };

export function deploymentUrl(origin: string, d: Pick<Deployment, "slug" | "env" | "id">) {
  return d.env === "production" ? `${origin}/s/${d.slug}` : `${origin}/s/${d.slug}?d=${d.id}`;
}
