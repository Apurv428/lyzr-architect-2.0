import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { acceptInvite } from "@/lib/actions/workspaces";
import { getUser } from "@/lib/supabase/server";

export const metadata = { title: "Join workspace · Architect" };

const MESSAGES: Record<string, (r: Record<string, string>) => string> = {
  not_found: () => "This invite link isn't valid any more. It may have been used already or revoked.",
  expired: () => "This invite has expired. Ask for a new link.",
  wrong_email: (r) => `This invite is for ${r.email}. Sign in with that email to accept it.`,
  domain: (r) => `This workspace only accepts @${r.domain} accounts.`,
};

/** Where an invite link lands: sign in if needed, then join the workspace. */
export default async function InvitePage(props: PageProps<"/invite/[token]">) {
  const { token } = await props.params;
  const { user } = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);

  const result = await acceptInvite(token);
  const ok = result.status === "ok";
  const message = ok
    ? `You're now a member of ${result.workspace}. Projects shared with it appear on your dashboard.`
    : result.status === "error"
      ? result.message
      : (MESSAGES[result.status]?.(result as unknown as Record<string, string>) ?? "Couldn't accept this invite.");

  return (
    <div className="bg-grid flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border bg-card p-6 text-center shadow-sm">
        <LogoMark className="mx-auto size-8" />
        <span className={`mx-auto grid size-11 place-items-center rounded-full ${ok ? "bg-emerald-500/15" : "bg-amber-500/15"}`}>
          {ok ? <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" /> : <TriangleAlert className="size-5 text-amber-600 dark:text-amber-400" />}
        </span>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">{ok ? "You're in" : "Couldn't join"}</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        <div className="flex justify-center gap-2">
          <Link href="/dashboard" className={buttonVariants({ size: "sm" })}>
            Go to dashboard
          </Link>
          {ok && (
            <Link href="/settings" className={buttonVariants({ size: "sm", variant: "outline" })}>
              View team
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
