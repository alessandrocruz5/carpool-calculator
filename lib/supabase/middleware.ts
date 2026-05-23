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

  if (
    !user &&
    !pathname.startsWith('/login') &&
    !pathname.startsWith('/auth')
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

  let role: string | null = null
  let memberExists = false
  if (userId && isPageRoute) {
    const { data: member } = await supabase
      .from('members')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()
    if (member) {
      memberExists = true
      role = (member as { role: string }).role
    }
  }

  if (role === 'passenger' && isDriverOnlyPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // If the user has no active-group cookie, send them to /groups to pick or
  // create one before they can use any part of the app.
  const carpoolCookie = request.cookies.get('carpool-group')?.value
  if (userId && isPageRoute && !carpoolCookie && pathname !== '/groups') {
    const url = request.nextUrl.clone()
    url.pathname = '/groups'
    return NextResponse.redirect(url)
  }

  // Forward auth + role to downstream RSCs via request headers so the root
  // layout can read them without re-querying Supabase. We rebuild the response
  // with the augmented request headers and copy over any auth cookies that
  // the Supabase client set during getClaims().
  if (userId || role) {
    const forwardedHeaders = new Headers(request.headers)
    if (userId) forwardedHeaders.set('x-user-id', userId)
    if (role) forwardedHeaders.set('x-user-role', role)
    if (userId && isPageRoute) {
      forwardedHeaders.set('x-member-exists', memberExists ? '1' : '0')
    }
    const forwardedResponse = NextResponse.next({
      request: { headers: forwardedHeaders },
    })
    supabaseResponse.cookies.getAll().forEach((c) =>
      forwardedResponse.cookies.set(c)
    )
    return forwardedResponse
  }

  return supabaseResponse
}
