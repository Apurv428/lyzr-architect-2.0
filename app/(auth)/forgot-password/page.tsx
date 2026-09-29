"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset, type AuthState } from "../actions";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestPasswordReset, undefined);

  if (state?.message) {
    return (
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10">
            <MailCheck className="size-6 text-emerald-500" />
          </div>
          <div className="space-y-1.5">
            <h2 className="font-semibold">Check your inbox</h2>
            <p className="text-sm text-muted-foreground">{state.message}</p>
          </div>
        </div>
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="inline-flex items-center gap-1.5 font-medium text-foreground underline-offset-4 hover:underline">
            <ArrowLeft className="size-3.5" /> Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Forgot your password?</h1>
        <p className="text-sm text-muted-foreground">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            required
            className="h-10"
            autoFocus
          />
        </div>

        {state?.error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {state.error}
          </p>
        )}

        <Button type="submit" size="lg" className="h-10 w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Send reset link
          {!pending && <ArrowRight />}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="inline-flex items-center gap-1.5 font-medium text-foreground underline-offset-4 hover:underline">
          <ArrowLeft className="size-3.5" /> Back to sign in
        </Link>
      </p>
    </div>
  );
}
