---
type: prompt
plan: "[[2026-10-29-supabase-keep-alive]]"
id: 01
unit: SABAY-51
status: skipped
model: opus
effort: high
depends_on: []
parallel_group: A
files:
  create: []
  modify: [lib/supabase/middleware.ts, lib/supabase/middleware.test.ts]
  delete: []
---
# 01 · Exempt `/api/health` from the signed-out redirect

## Task
Let a signed-out request to exactly `/api/health` pass through the Supabase session middleware without being
redirected to `/auth/login`. Add tests that prove this exemption and prove that nothing else changed.

## Context
Repo root: `/home/apa/Code/carpool-calculator` (Next.js 14 App Router, TypeScript strict, Vitest).

**Why:** `app/api/health/route.ts` is a public DB-ping endpoint (service-role `settings` select, `limit(1)`).
A daily Vercel cron (prompt 02) and an external uptime monitor call it with no session cookie. Today the
middleware sends them a 307 to `/auth/login`, so the handler never runs and Supabase sees no activity.

**`middleware.ts`** (root) runs `updateSession(request)` from `lib/supabase/middleware.ts` on every path except
static assets. Do not touch `middleware.ts` or its matcher.

**`lib/supabase/middleware.ts:47-60`** currently reads:
```ts
  // `/` is the public marketing landing — signed-out visitors stay here
  // instead of being bounced to login. Every other protected path still
  // redirects unauthenticated users to the login page.
  const isPublicLanding = !user && pathname === '/'

  if (
    !user &&
    pathname !== '/' &&
    !pathname.startsWith('/login') &&
    !pathname.startsWith('/auth') &&
    !pathname.startsWith('/legal')
  ) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }
```
Change:
1. Add `pathname !== '/api/health' &&` to that condition. It must be an **exact** match, not `startsWith`,
   so that `/api/healthz` or `/api/health/anything` stay protected.
2. Add a one-line comment above the `if`, in the file's existing comment voice. Say that `/api/health` is a
   public DB ping for the keep-alive cron and the uptime monitor, and that it reads no session.

Leave the rest alone. Specifically:
- `isPublicLanding` stays `pathname === '/'`.
- Don't add code between `createServerClient` and `getClaims()`. The comment at `:33-38` explains why.
- Don't change the trusted-header strip at `:166-180`. It must keep running for `/api/health`.
  `isPageRoute` (`:67-70`) is already false for `/api/*`, so no member lookups happen.
- Don't introduce a helper, constant or allowlist array. It's one condition, matching the existing style
  (single quotes, no semicolons in this file).

**`lib/supabase/middleware.test.ts`**: add the tests inside the existing
`describe("updateSession public landing at /", ...)` block (starts at `:200`). Copy the shape of the signed-out
tests there (`:201-212` and `:236-241`), which use the file's helpers `setSupa`, `makeRequest(pathname,
cookies, extraHeaders)` and `forwardedHeader(res, name)`. Tests to add:
1. Signed-out `/api/health` → `res.status` is `200` and `res.headers.get("location")` is null. The middleware
   returns `NextResponse.next`; the route handler isn't invoked in this unit test.
2. Signed-out `/api/health` with a spoofed `x-user-id: attacker` header →
   `forwardedHeader(res, "x-user-id")` is null, and `forwardedHeader(res, "x-landing")` is null (it is not the
   landing).
3. Signed-out `/api/healthz` and `/api/health/x` → each is `307` with `location` containing `/auth/login`. Use
   two `it`s, or one `it.each`, whichever matches the file. The file has no `it.each`, so use two `it`s.

Test file conventions: double quotes and semicolons (unlike the source file). Use
`setSupa({ auth: { userId: null } })` for signed-out.

Project rules: minimal diff. Don't refactor adjacent code. Server-side authz lives here and in route guards.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Exempt `/api/push/send` or any other path. That's a separate planned hotfix.
- Add dependencies, abstractions or config that aren't listed here.
- Create or switch branches, commit, or push.

## Done when
```bash
npx vitest run lib/supabase/middleware.test.ts
npm test
npx tsc --noEmit
npm run lint
```
- The new tests fail if the predicate is `startsWith('/api/health')`. Check this by temporarily swapping it,
  then revert.
- All pre-existing tests in `middleware.test.ts` pass unchanged.
