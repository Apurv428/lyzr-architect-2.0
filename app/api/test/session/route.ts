/**
 * Dev-only endpoint: create (or re-use) a confirmed test user and return an
 * active session so Playwright can skip the email-confirmation flow entirely.
 *
 * Guards:
 *   – Only works in development (NODE_ENV !== "production").
 *   – Requires SUPABASE_SERVICE_ROLE_KEY env var.
 *   – Caller must supply the E2E_SECRET header, and E2E_SECRET must be set (there is no default).
 *
 * Response sets the standard Supabase auth cookies so the Next.js middleware
 * treats the caller as authenticated.
 */
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase/env";

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const E2E_SECRET = process.env.E2E_SECRET ?? "";

export async function POST(request: Request) {
  // Guard: only in development.
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Not available in production" }, { status: 403 });
  }

  // Guard: check secret.
  const secret = request.headers.get("x-e2e-secret");
  if (!E2E_SECRET || secret !== E2E_SECRET) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!SERVICE_ROLE_KEY) {
    return Response.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local to run E2E tests." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email : process.env.E2E_EMAIL;
  const password = typeof body.password === "string" ? body.password : process.env.E2E_PASSWORD;
  if (!email || !password) return Response.json({ error: "Send email and password, or set E2E_EMAIL and E2E_PASSWORD." }, { status: 400 });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Create the user (idempotent — ignores "already registered" errors).
  await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "E2E Test User" },
  });

  // Sign in to get a real session.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3130"}/dashboard` },
  });

  if (error || !data.properties) {
    // Fallback: sign in with password.
    const { data: pw, error: pwErr } = await admin.auth.signInWithPassword({ email, password });
    if (pwErr || !pw.session) {
      return Response.json({ error: pwErr?.message ?? "sign-in failed" }, { status: 500 });
    }
    return Response.json({ session: pw.session });
  }

  return Response.json({ actionLink: data.properties.action_link, email, password });
}
