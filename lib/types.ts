export type Mode = "guided" | "pro";

export type ProjectStatus =
  | "draft"
  | "planning"
  | "building"
  | "ready"
  | "deployed"
  | "error";

export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
  experience_level: number;
  default_mode: Mode;
  onboarded: boolean;
  credits: number;
};

export type Project = {
  id: string;
  name: string;
  description: string | null;
  prompt: string | null;
  mode: Mode;
  template_id: string | null;
  framework: string | null;
  status: ProjectStatus;
  deploy_url: string | null;
  thumbnail_url?: string | null;
  created_at: string;
  updated_at: string;
};
