import { test as base, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * E2E auth strategy: bypass the magic-link round-trip by minting a session
 * server-side with the service-role key, then injecting it into the browser
 * via Supabase's `setSession`. The browser then behaves as a signed-in user
 * without ever hitting the real email provider.
 *
 * Required env vars (in CI, wired from GitHub secrets):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *   SUPABASE_SERVICE_ROLE_KEY  (admin: createUser / generateLink)
 *
 * Tests that need a signed-in user use the `authedPage` fixture below.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

export interface TestUser {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

export async function createTestUser(): Promise<TestUser> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE) {
    throw new Error(
      "E2E auth bypass needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  const admin: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const stamp = Date.now();
  const email = `e2e-${stamp}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const password = `e2e-pw-${stamp}-${Math.random()}`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    throw createErr ?? new Error("createUser failed");
  }

  // Sign in once to get the tokens — we'll plant them in the browser.
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: session, error: signErr } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (signErr || !session.session) {
    throw signErr ?? new Error("signIn failed");
  }
  return {
    id: created.user.id,
    email,
    accessToken: session.session.access_token,
    refreshToken: session.session.refresh_token,
  };
}

export async function plantSession(page: Page, user: TestUser) {
  // Visit the app first so the Supabase client's localStorage origin matches.
  await page.goto("/auth/login");
  await page.evaluate(
    ({ url, accessToken, refreshToken }) => {
      // Supabase JS stores the session keyed by project ref under
      // `sb-<ref>-auth-token`. We don't know the ref at compile-time, so we
      // derive it from the project URL.
      const ref = new URL(url).host.split(".")[0];
      const key = `sb-${ref}-auth-token`;
      const value = {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { url: SUPABASE_URL!, accessToken: user.accessToken, refreshToken: user.refreshToken }
  );
}

export const test = base.extend<{ authedPage: Page; testUser: TestUser }>({
  testUser: async ({}, use) => {
    const user = await createTestUser();
    await use(user);
  },
  authedPage: async ({ page, testUser }, use) => {
    await plantSession(page, testUser);
    await use(page);
  },
});

export { expect };
