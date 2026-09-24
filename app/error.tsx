"use client";

import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="bg-grid flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-destructive/15"><TriangleAlert className="size-6 text-destructive" /></span>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="max-w-sm text-sm text-muted-foreground">Your work is safe — every change is saved as a checkpoint. Try again, or head back to your projects.</p>
        {error.digest && <p className="font-mono text-xs text-muted-foreground">ref: {error.digest}</p>}
      </div>
      <div className="flex gap-2">
        <Button size="lg" onClick={() => retry()}><RotateCcw /> Try again</Button>
        <Link href="/dashboard" className={buttonVariants({ variant: "outline", size: "lg" })}>Dashboard</Link>
      </div>
    </div>
  );
}
