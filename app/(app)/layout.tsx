import { redirect } from "next/navigation";
import { Sidebar } from "@/components/app/sidebar";
import { CommandPalette } from "@/components/app/command-palette";
import { currentCredits } from "@/lib/credits";
import { getUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, credits, { data: isAdmin }] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url, onboarded").eq("id", user.id).single(),
    currentCredits(supabase),
    supabase.rpc("is_admin"),
  ]);

  if (profile && !profile.onboarded) redirect("/onboarding");

  return (
    <div className="flex min-h-dvh">
      <Sidebar
        user={{
          name: profile?.full_name || user.email?.split("@")[0] || "You",
          email: user.email ?? "",
          avatarUrl: profile?.avatar_url ?? null,
          credits,
          isAdmin: isAdmin === true,
        }}
      />
      <main className="min-w-0 flex-1">{children}</main>
      <CommandPalette />
    </div>
  );
}
