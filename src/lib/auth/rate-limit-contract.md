# Rate Limiting — Contrato de Auth

## Estratégia

Supabase Auth aplica rate limiting nativo por IP e por email.
O projeto não implementa rate limiting customizado em middleware Next.js.
O mapeamento de resposta (Supabase error → HTTP 429 + Retry-After) é responsabilidade dos route handlers.

## Limites por Endpoint

| Endpoint | Limite | Janela | Resposta |
|----------|--------|--------|----------|
| POST /api/v1/auth/login | 5 tentativas | 1 min / IP | 429 + Retry-After + AUTH_003 |
| POST /api/v1/auth/reset-password | 3 tentativas | 1 min / IP | 429 + Retry-After |
| POST /api/v1/auth/update-password | 3 tentativas | 1 min | 429 + Retry-After |

## Mapeamento de Erro Supabase → HTTP

| Condição | HTTP | Código interno |
|----------|------|----------------|
| `error.status === 429` | 429 | AUTH_003 — header `Retry-After: {seconds}` incluído |
| `over_email_send_rate_limit` | 429 | AUTH_003 |
| `over_request_rate_limit` | 429 | AUTH_003 |
| `invalid_credentials` | 401 | AUTH_002 |
| `user_not_found` | 401 | AUTH_002 (mascarado para não revelar existência) |

## Comportamento Implementado (login/route.ts)

1. Supabase retorna erro com `status === 429`
2. Route handler extrai `retryAfter` do `error.message` via regex `/\d+/`
3. Resposta inclui header `Retry-After: {retryAfter}` e body com `AUTH_003`
4. UI exibe countdown interativo com botão desabilitado

## Referências

- `SEC-005`: Rate limiting em endpoints de auth
- `ERROR-CATALOG`: AUTH_003 (429 — Muitas tentativas)
- Blueprint: `rate-limiting.md`
