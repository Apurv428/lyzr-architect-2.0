/**
 * Playwright global setup: creates and confirms the E2E test user, then signs
 * in via the Supabase password endpoint to get real session tokens.
 * Tokens are written to /tmp/e2e-tokens.json so auth.setup.ts can inject
 * them directly into browser localStorage — no magic-link redirect needed.
 */
import path from "path";
import { request } from "@playwright/test";
import { config as dotenvConfig } from "dotenv";
import { writeFileSync } from "fs";

dotenvConfig({ path: path.resolve(__dirname, "../.env.local"), override: false });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
// No defaults: the repo is public, so a built-in login would work for anyone against the live project.
const E2E_EMAIL = process.env.E2E_EMAIL ?? "";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "";

export default async function globalSetup() {
  if (!SUPABASE_URL) {
    console.warn("[E2E] NEXT_PUBLIC_SUPABASE_URL is not set — skipping user provision.");
    return;
  }
  if (!E2E_EMAIL || !E2E_PASSWORD) {
    console.warn("[E2E] Set E2E_EMAIL and E2E_PASSWORD to provision the test user.");
    return;
  }
  if (!SERVICE_ROLE_KEY) {
    console.warn("[E2E] SUPABASE_SERVICE_ROLE_KEY not set — authenticated tests will likely fail.");
    return;
  }

  const ctx = await request.newContext();
  const adminHeaders = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };

  // 1. Create (or ignore if already exists) the test user with email pre-confirmed.
  const createRes = await ctx.post(`${SUPABASE_URL}/auth/v1/admin/users`, {
    headers: adminHeaders,
    data: {
      email: E2E_EMAIL,
      password: E2E_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "E2E Test User" },
    },
  });
  if (createRes.ok()) {
    console.log(`[E2E] Test user created: ${E2E_EMAIL}`);
  } else {
    const body = await createRes.json().catch(() => ({}));
    if (!String(body.msg ?? body.message ?? "").toLowerCase().includes("already")) {
      console.warn(`[E2E] Create user returned ${createRes.status()}:`, body);
    } else {
      console.log(`[E2E] Test user already exists: ${E2E_EMAIL}`);
    }
  }

  // 2. Upsert the profile row so the app skips onboarding.
  const listRes = await ctx.get(
    `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(E2E_EMAIL)}`,
    { headers: adminHeaders },
  );
  if (listRes.ok()) {
    const { users } = await listRes.json();
    const userId: string | undefined = users?.[0]?.id;
    if (userId) {
      await ctx.post(`${SUPABASE_URL}/rest/v1/profiles`, {
        headers: {
          ...adminHeaders,
          Prefer: "resolution=merge-duplicates",
        },
        data: {
          id: userId,
          full_name: "E2E Test User",
          default_mode: "guided",
          onboarded: true,
          credits: 200,
          role: "developer",
          experience_level: 3,
          tour_completed: true,
        },
      });
      console.log(`[E2E] Profile upserted for user ${userId}`);
    }
  }

  // 3. Sign in via password to get real session tokens (no redirect required).
  const tokenRes = await ctx.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      data: { email: E2E_EMAIL, password: E2E_PASSWORD },
    },
  );

  if (tokenRes.ok()) {
    const session = await tokenRes.json();
    // Persist tokens for auth.setup.ts to inject into the browser.
    writeFileSync("/tmp/e2e-tokens.json", JSON.stringify(session, null, 2), "utf-8");
    console.log("[E2E] Session tokens saved to /tmp/e2e-tokens.json");
  } else {
    const errBody = await tokenRes.text().catch(() => "?");
    console.error(`[E2E] Password sign-in failed (${tokenRes.status()}): ${errBody}`);
    console.error("[E2E] Auth setup will fall back to UI login.");
  }

  await ctx.dispose();
  console.log("[E2E] Global setup complete.");
}
