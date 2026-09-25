import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-14 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="mx-auto h-9 w-80" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-52 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
