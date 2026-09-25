import { Loader2 } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex h-dvh flex-col">
      <div className="flex h-12 items-center gap-3 border-b px-3">
        <LogoMark className="size-6" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-6 w-28" />
        <Skeleton className="ml-auto h-7 w-24" />
      </div>
      <div className="grid flex-1 md:grid-cols-[36%_1fr]">
        <div className="space-y-4 border-r p-4">
          <Skeleton className="ml-auto h-12 w-3/4 rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
        <div className="bg-grid hidden items-center justify-center md:flex">
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Opening workspace…</p>
        </div>
      </div>
    </div>
  );
}
