import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isDriverOnlyPath } from '@/lib/auth/passengerAccess'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims as { sub?: string } | undefined

  const pathname = request.nextUrl.pathname

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

  // Look up the member row once per request and forward role + membership
  // status to RSCs via request headers, so the root layout doesn't have to
  // repeat the same query. Skip for API routes and auth pages — those don't
  // render the layout nav and don't need role gating.
  const userId = (user as { sub?: string } | undefined)?.sub
  const isPageRoute =
    !pathname.startsWith('/api') &&
    !pathname.startsWith('/auth') &&
    !pathname.startsWith('/login')

  // Read the active-group cookie early so the member lookup can be scoped to
  // it. Without this scope, maybeSingle() would fail with a multiple-rows
  // error whenever a user belongs to more than one group, incorrectly setting
  // memberExists=false and triggering a / → /onboarding → / redirect loop.
  const carpoolCookie = request.cookies.get('carpool-group')?.value

  let role: string | null = null
  let memberExists = false
  if (userId && isPageRoute) {
    if (carpoolCookie) {
      // Scope the lookup to the active group — one row at most, correct role.
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('user_id', userId)
        .eq('group_id', carpoolCookie)
        .maybeSingle()
      if (member) {
        memberExists = true
        role = (member as { role: string }).role
      } else {
        // Cookie references a group the user left; check any membership.
        const { data: anyMember } = await supabase
          .from('members')
          .select('group_id')
          .eq('user_id', userId)
          .limit(1)
          .maybeSingle()
        memberExists = anyMember !== null
      }
    } else {
      // No cookie yet — just check whether the user has any membership.
      const { data: anyMember } = await supabase
        .from('members')
        .select('group_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle()
      memberExists = anyMember !== null
    }
  }

  if (role === 'passenger' && isDriverOnlyPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // New users visiting / with no group memberships should go through
  // onboarding to create or join their first group.
  if (userId && isPageRoute && pathname === '/' && !memberExists) {
    const url = request.nextUrl.clone()
    url.pathname = '/onboarding'
    return NextResponse.redirect(url)
  }

  // If the user has no active-group cookie, send them to /groups to pick or
  // create one before they can use any part of the app.
  // /onboarding is exempt — it's where zero-group users land first.
  if (
    userId &&
    isPageRoute &&
    !carpoolCookie &&
    pathname !== '/groups' &&
    pathname !== '/onboarding'
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/groups'
    return NextResponse.redirect(url)
  }

  // Server-side gate on /admin/* — RLS already protects the data, but we
  // don't want the admin shell to render for anyone who can't drive in the
  // active group. Require a members row for (user, active group) with a
  // driver-capable role.
  if (userId && isPageRoute && pathname.startsWith('/admin') && carpoolCookie) {
    const { data: adminMember } = await supabase
      .from('members')
      .select('role')
      .eq('user_id', userId)
      .eq('group_id', carpoolCookie)
      .maybeSingle()
    const adminRole = (adminMember as { role: string } | null)?.role
    if (adminRole !== 'driver' && adminRole !== 'both') {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      url.searchParams.set('error', 'forbidden')
      return NextResponse.redirect(url)
    }
  }

  // Forward auth + role to downstream RSCs via request headers so the root
  // layout can read them without re-querying Supabase. We rebuild the response
  // with the augmented request headers and copy over any auth cookies that
  // the Supabase client set during getClaims().
  //
  // This runs on every (non-redirect) request so the trusted-header strip below
  // is unconditional: a client can only spoof its own request, but the invariant
  // "these headers are server-controlled" then holds on every path, not just `/`.
  const forwardedHeaders = new Headers(request.headers)
  // Never trust client-supplied copies of these — strip first, then set only
  // the values we resolved server-side. Prevents a signed-out visitor from
  // spoofing `x-user-id` on `/` to bypass the landing and reach the app home.
  forwardedHeaders.delete('x-user-id')
  forwardedHeaders.delete('x-user-role')
  forwardedHeaders.delete('x-member-exists')
  forwardedHeaders.delete('x-landing')
  if (userId) forwardedHeaders.set('x-user-id', userId)
  if (role) forwardedHeaders.set('x-user-role', role)
  if (userId && isPageRoute) {
    forwardedHeaders.set('x-member-exists', memberExists ? '1' : '0')
  }
  // Signal the signed-out landing so the root layout renders it bare
  // (no authed header / bottom-nav shell).
  if (isPublicLanding) forwardedHeaders.set('x-landing', '1')
  const forwardedResponse = NextResponse.next({
    request: { headers: forwardedHeaders },
  })
  supabaseResponse.cookies.getAll().forEach((c) =>
    forwardedResponse.cookies.set(c)
  )
  return forwardedResponse
}
