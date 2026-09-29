"use client";

import { useActionState } from "react";
import { AlertCircle, ArrowRight, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePassword, type AuthState } from "../actions";

export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(updatePassword, undefined);

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1.5">
        <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-primary/10">
          <KeyRound className="size-5 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
        <p className="text-sm text-muted-foreground">
          Choose a strong password — at least 6 characters.
        </p>
      </div>

      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            minLength={6}
            required
            className="h-10"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            name="confirm"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            minLength={6}
            required
            className="h-10"
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
          Update password
          {!pending && <ArrowRight />}
        </Button>
      </form>
    </div>
  );
}
