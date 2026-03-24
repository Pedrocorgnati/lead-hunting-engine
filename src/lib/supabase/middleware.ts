import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Public routes that don't require authentication
  const publicPaths = ['/login', '/invite', '/auth/reset-password']
  const isPublicPath = publicPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  )
  const isApiAuth = request.nextUrl.pathname.startsWith('/api/v1/auth')
  const isApiInvite = request.nextUrl.pathname.startsWith('/api/v1/invites')

  if (!user && !isPublicPath && !isApiAuth && !isApiInvite) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isPublicPath && request.nextUrl.pathname !== '/auth/reset-password') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // G02 — Onboarding gate: redirect users who haven't completed onboarding
  if (user && !isPublicPath && !isApiAuth && !isApiInvite) {
    const pathname = request.nextUrl.pathname
    const isOnboardingPath = pathname === '/onboarding'
    const isApiPath = pathname.startsWith('/api/')

    if (!isOnboardingPath && !isApiPath) {
      try {
        const { data: profile } = await supabase
          .from('UserProfile')
          .select('onboardingCompletedAt')
          .eq('id', user.id)
          .single()

        if (profile && profile.onboardingCompletedAt === null) {
          const url = request.nextUrl.clone()
          url.pathname = '/onboarding'
          return NextResponse.redirect(url)
        }
      } catch {
        // Se a query falhar, o page-level check em (app)/layout.tsx assume o controle
      }
    }
  }

  return supabaseResponse
}
