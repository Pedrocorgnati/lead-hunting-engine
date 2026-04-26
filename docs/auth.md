# Autenticação — Lead Hunting Engine

## Visão geral

Supabase Auth via `@supabase/ssr`. Cookies httpOnly gerenciados pelo pacote; JWT refresh automático via `autoRefreshToken`.

## Configuração

### Client (browser)

`src/lib/supabase/client.ts`:
```ts
createBrowserClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})
```

### Server (SSR / Route Handlers)

`src/lib/supabase/server.ts` — cria cliente por request lendo cookies do `next/headers`. Usa middleware em `src/middleware.ts` + `src/lib/supabase/middleware.ts` para rotacionar cookies quando o refresh ocorre.

### Admin / service role

`src/lib/supabase/admin.ts` — service-role client. Cache singleton. **NUNCA importado em Client Components.**

## Janela de sessão

- **JWT expiry:** 86400s (24h). Configurado no Dashboard Supabase → Auth → JWT expiry.
- **Refresh token expiry:** 30 dias (default Supabase).
- **Refresh automático:** `autoRefreshToken: true` dispara refresh ~5min antes do expiry via polling interno do SDK.

## Fluxo PKCE

`flowType: 'pkce'` usa code verifier local-storage + challenge no auth endpoint. Protege contra interceptação do code em redirect.

## Gates do middleware

Rotas públicas declaradas em `src/lib/supabase/middleware.ts`:
- `MARKETING_PATHS`: landing, contato, obrigado, privacidade, termos.
- `AUTH_PAGE_PATHS`: login, invite.
- `AUTH_RESET_PATH`: /auth/reset-password.
- APIs públicas: /api/v1/auth/*, /api/v1/invites/*, /api/v1/waitlist, /api/v1/contact, /api/v1/consent.

Demais rotas exigem sessão válida; caso contrário redirect para `/login`.

## Endpoints relevantes

| Endpoint | Propósito |
|----------|-----------|
| POST /api/v1/auth/update-password | Atualiza senha + signOut global + audit |
| POST /api/v1/auth/verify-password | Re-autenticação para operações sensíveis (TASK-18/ST003) |
| GET /api/v1/profile/sessions | Lista sessões ativas (TASK-17) |
| DELETE /api/v1/profile/sessions/[id] | Revoga sessão específica |
| POST /api/v1/admin/users/[id]/invalidate-sessions | Admin revoga todas sessões do usuário |
| POST /api/v1/admin/users/[id]/force-reset | Força troca de senha no próximo login |

## Banners

- `OfflineBanner` — offline do navegador (TASK-19).
- `AuthOfflineBanner` — polling `/api/health?service=supabase`; banner vermelho (TASK-18/ST002).

## Audit actions relacionadas

- `AUTH_LOGOUT`, `AUTH_SIGNUP`, `AUTH_SIGNUP_ADMIN`
- `session.invalidated_by_password_change`
- `session.invalidated_by_admin`
- `admin.force_password_reset`
- `forced_password_reset_completed`
- `user.deletion_requested`
- `ADMIN_CREDENTIAL_COPIED`

## Segurança

- Re-autenticação obrigatória para delete de conta (ReauthDialog).
- Rate-limit `/api/v1/auth/verify-password`: 3 tentativas/min (bucket `authVerify`).
- Sessões listáveis pelo próprio usuário; encerramento remoto suportado exceto a sessão atual.
- `ENCRYPTION_KEY` + `JWT_SECRET` obrigatórios em produção (validados no boot).
