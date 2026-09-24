import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { Onboarding } from "./onboarding";

export default async function Page(props: PageProps<"/onboarding">) {
  const { next } = await props.searchParams;
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const firstName = (profile?.full_name ?? user.email ?? "there").split(/[\s@]/)[0];
  return <Onboarding firstName={firstName} next={typeof next === "string" ? next : "/dashboard"} />;
}
