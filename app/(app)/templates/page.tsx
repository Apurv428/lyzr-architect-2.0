import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import type { Mode } from "@/lib/types";
import { TemplatesBrowser } from "./templates-browser";

export const metadata = { title: "Templates — Architect" };

export default async function TemplatesPage() {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("default_mode")
    .eq("id", user.id)
    .single();
  const mode = (profile?.default_mode ?? "guided") as Mode;

  return (
    <div className="flex flex-col">
      <header className="border-b px-6 py-5">
        <h1 className="text-xl font-semibold">Templates</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Pick a starting point and Architect will propose a plan you can edit before building.
        </p>
      </header>
      <TemplatesBrowser mode={mode} />
    </div>
  );
}
