import Link from "next/link";
import { GitBranch, GitPullRequest, ScanSearch } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ImportRepoCard() {
  return (
    <div className="flex h-[calc(100%-2.75rem)] flex-col rounded-xl border bg-card/60 p-5">
      <p className="text-sm text-muted-foreground">
        Import a GitHub repo — Architect detects your stack and adds agents without rewriting what works.
      </p>
      <ul className="mt-4 space-y-2.5 text-sm">
        <li className="flex items-center gap-2"><ScanSearch className="size-4 text-primary" /> Auto-detect framework</li>
        <li className="flex items-center gap-2"><GitBranch className="size-4 text-primary" /> Work on a branch</li>
        <li className="flex items-center gap-2"><GitPullRequest className="size-4 text-primary" /> Ship changes as a PR</li>
      </ul>
      <Link href="/import" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "mt-auto w-full")}>
        Import from GitHub
      </Link>
    </div>
  );
}
