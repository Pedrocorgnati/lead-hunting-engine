import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// TASK-1/ST001 (CL-308): rotas publicas acessiveis sem sessao.
// Subdivididas em dois grupos:
//  - MARKETING: sempre servidas, mesmo se o usuario estiver logado
//    (landing, paginas legais, contato, obrigado, blog)
//  - AUTH_PAGES: acessiveis sem sessao, redirecionam para /dashboard
//    quando ha sessao (login, invite)
const MARKETING_PATHS = [
  '/',
  '/contato',
  '/obrigado',
  '/privacidade',
  '/termos',
]
const MARKETING_PREFIXES = ['/blog']
const AUTH_PAGE_PATHS = ['/login', '/invite']
// Reset-password/update e especial: pode ser acessada por sessao ativa
// (fluxo "trocar senha depois de receber link")
const AUTH_RESET_PATH = '/auth/reset-password'

function isMarketingPath(pathname: string): boolean {
  if (MARKETING_PATHS.includes(pathname)) return true
  return MARKETING_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function isAuthPage(pathname: string): boolean {
  return AUTH_PAGE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function isAuthResetPath(pathname: string): boolean {
  return pathname === AUTH_RESET_PATH || pathname.startsWith(`${AUTH_RESET_PATH}/`)
}

function isPublicApi(pathname: string): boolean {
  // Endpoints publicos: auth, convites e formularios de landing.
  return (
    pathname.startsWith('/api/v1/auth') ||
    pathname.startsWith('/api/v1/invites') ||
    pathname === '/api/v1/waitlist' ||
    pathname === '/api/v1/contact' ||
    pathname === '/api/v1/consent'
  )
}

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

  const pathname = request.nextUrl.pathname
  const publicApi = isPublicApi(pathname)
  const marketing = isMarketingPath(pathname)
  const authPage = isAuthPage(pathname)
  const authReset = isAuthResetPath(pathname)

  // Sem sessao -> bloqueia apenas rotas protegidas (app, api privada, reset update).
  if (!user && !marketing && !authPage && !authReset && !publicApi) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // TASK-6 (CL-189): preservar rota original para retorno pos-login + sinalizar motivo
    const originalPath = request.nextUrl.pathname + request.nextUrl.search
    if (!pathname.startsWith('/api/')) {
      url.searchParams.set('reason', 'session_expired')
      url.searchParams.set('redirectTo', originalPath)
    }
    return NextResponse.redirect(url)
  }

  // Com sessao + em pagina de auth (login/invite) -> vai para /dashboard.
  // Rotas de marketing e reset-password permanecem acessiveis.
  if (user && authPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // G02 — Onboarding gate + TASK-7 (CL-473) must-reset-password gate.
  // Ambos so aplicam a rotas de app; landing, auth e api publica ficam de fora.
  if (user && !marketing && !authPage && !authReset && !publicApi) {
    const isOnboardingPath = pathname === '/onboarding'
    const isApiPath = pathname.startsWith('/api/')
    const isLogoutPath =
      pathname === '/api/v1/auth/logout' || pathname === '/logout'
    const isUpdatePasswordApi = pathname === '/api/v1/auth/update-password'

    if (!isOnboardingPath && !isApiPath) {
      try {
        const { data: profile } = await supabase
          .from('UserProfile')
          .select('onboardingCompletedAt, mustResetPassword')
          .eq('id', user.id)
          .single()

        if (profile?.mustResetPassword) {
          const url = request.nextUrl.clone()
          url.pathname = '/auth/reset-password/update'
          url.searchParams.set('reason', 'admin_forced')
          return NextResponse.redirect(url)
        }

        if (profile && profile.onboardingCompletedAt === null) {
          const url = request.nextUrl.clone()
          url.pathname = '/onboarding'
          return NextResponse.redirect(url)
        }
      } catch {
        // Se a query falhar, o page-level check em (app)/layout.tsx assume o controle
      }
    } else if (isApiPath && !isLogoutPath && !isUpdatePasswordApi) {
      // APIs privadas com flag ativa devolvem 409 — cliente deve redirecionar.
      try {
        const { data: profile } = await supabase
          .from('UserProfile')
          .select('mustResetPassword')
          .eq('id', user.id)
          .single()

        if (profile?.mustResetPassword) {
          return NextResponse.json(
            {
              error: {
                code: 'AUTH_007',
                message: 'Troca de senha obrigatoria antes de prosseguir.',
              },
            },
            { status: 409 }
          )
        }
      } catch {
        // fall-through
      }
    }
  }

  return supabaseResponse
}
