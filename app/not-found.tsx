import Link from "next/link";
import { Compass } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="bg-grid flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <LogoMark className="size-10" />
      <div className="space-y-2">
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Compass className="size-4" /> 404</p>
        <h1 className="text-2xl font-semibold tracking-tight">This page wandered off</h1>
        <p className="max-w-sm text-sm text-muted-foreground">The project or link may have been deleted, or you might not have access to it.</p>
      </div>
      <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>Back to your projects</Link>
    </div>
  );
}
