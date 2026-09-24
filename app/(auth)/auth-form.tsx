"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle, ArrowRight, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { signIn, signUp, type AuthState } from "./actions";
import { OAuthButtons } from "./oauth-buttons";

export function AuthForm({ variant, next }: { variant: "login" | "signup"; next: string }) {
  const isLogin = variant === "login";
  const [state, action, pending] = useActionState<AuthState, FormData>(
    isLogin ? signIn : signUp,
    undefined,
  );
  const nextQuery = next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isLogin ? "Welcome back" : "Create your account"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isLogin
            ? "Pick up where you left off."
            : "Free to start. No credit card, no code required."}
        </p>
      </div>

      <OAuthButtons next={next} />

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <Separator className="flex-1" />
        or with email
        <Separator className="flex-1" />
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        {!isLogin && (
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" placeholder="Ada Lovelace" autoComplete="name" required className="h-10" />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" placeholder="you@company.com" autoComplete="email" required className="h-10" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder={isLogin ? "••••••••" : "At least 6 characters"}
            autoComplete={isLogin ? "current-password" : "new-password"}
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
        {state?.message && (
          <p className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
            <MailCheck className="mt-0.5 size-4 shrink-0" />
            {state.message}
          </p>
        )}

        <Button type="submit" size="lg" className="h-10 w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {isLogin ? "Sign in" : "Create account"}
          {!pending && <ArrowRight />}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {isLogin ? "New to Architect? " : "Already have an account? "}
        <Link
          href={`${isLogin ? "/signup" : "/login"}${nextQuery}`}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {isLogin ? "Create an account" : "Sign in"}
        </Link>
      </p>
    </div>
  );
}
