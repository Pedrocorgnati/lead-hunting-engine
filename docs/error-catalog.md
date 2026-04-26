# Error Catalog

Referência central dos códigos de erro da aplicação. Fonte canonica: `src/constants/errors.ts`.

Todo endpoint deve retornar JSON `{ error: { code, message, details? } }` via `errorResponse()` com HTTP status conforme tabela.

## VAL — Validation

| Code | HTTP | Quando usar |
|------|------|-------------|
| VAL_001 | 400 | Campo obrigatório ausente |
| VAL_002 | 400 | Formato inválido (regex/tipo/enum) |
| VAL_003 | 400 | Valor fora do range permitido |
| VAL_004 | 400 | Campo excede limite de caracteres |

## SYS — System

| Code | HTTP | Quando usar |
|------|------|-------------|
| SYS_001 | 500 | Erro inesperado (inclui `errorId` para correlação) |
| SYS_002 | 503 | Serviço externo indisponível |
| SYS_003 | 504 | Operação excedeu timeout |
| SYS_004 | 502 | Resposta inválida de serviço externo |

## AUTH — Authentication

| Code | HTTP | Quando usar |
|------|------|-------------|
| AUTH_001 | 401 | JWT inválido/expirado |
| AUTH_002 | 401 | Credenciais inválidas |
| AUTH_003 | 429 | Rate limit Supabase Auth |
| AUTH_004 | 403 | Permissão insuficiente por role |
| AUTH_005 | 410 | Token reset senha expirado |
| AUTH_006 | 401 | Re-autenticação exigida (operação sensível) |

## RATE — Rate Limiting

| Code | HTTP | Quando usar |
|------|------|-------------|
| RATE_001 | 429 | Rate limit por endpoint/bucket |
| LANDING_RATE_LIMITED | 429 | Landing forms (waitlist/contact) |
| RATE_LIMITED_GLOBAL | 429 | Global overload (front-end mostra banner) — TASK-19 |

## INVITE — Invites

| Code | HTTP | Quando usar |
|------|------|-------------|
| INVITE_001 | 403 | Non-admin tentou criar convite |
| INVITE_020 | 400 | Email já registrado |
| INVITE_021 | 409 | Convite pendente já existe |
| INVITE_022 | 400 | Termos não aceitos |
| INVITE_050 | 410 | Convite expirado |
| INVITE_051 | 410 | Convite já utilizado |
| INVITE_080 | 404 | Convite não encontrado |

## JOB — Coleta

| Code | HTTP | Quando usar |
|------|------|-------------|
| JOB_020 | 400 | Parâmetros inválidos |
| JOB_050 | 429 | Limite concorrência atingido |
| JOB_051 | 403 | Lead ownership mismatch |
| JOB_052 | 409 | Cancelamento inválido (job terminal) |
| JOB_053 | 429 | Quota mensal de leads atingida |
| JOB_080 | 404 | Coleta não encontrada |

## LEAD — Leads

| Code | HTTP | Quando usar |
|------|------|-------------|
| LEAD_020 | 400 | Notes excede 2000 chars |
| LEAD_050 | 403 | Lead ownership mismatch |
| LEAD_051 | 422 | Transição de status inválida |
| LEAD_080 | 404 | Lead não encontrado |

## EXPORT — Export

| Code | HTTP | Quando usar |
|------|------|-------------|
| EXPORT_050 | 400 | Export síncrono >1.000 rows |
| EXPORT_MAX_ROWS_EXCEEDED | 413 | Export excede EXPORT_MAX_ROWS (10k) — usar async |

## LANDING — Marketing forms

| Code | HTTP | Quando usar |
|------|------|-------------|
| LANDING_RATE_LIMITED | 429 | Rate-limit landing forms |
| WAITLIST_DUPLICATE | 409 | Email já na waitlist |
| CONTACT_SPAM | 400 | Contact flagged spam |
| LGPD_CONSENT_REQUIRED | 422 | Consentimento LGPD ausente |

## CONFIG — Configuração admin

| Code | HTTP | Quando usar |
|------|------|-------------|
| CONFIG_050 | 500 | Encriptação credencial falhou |
| CONFIG_080 | 404 | API credential não encontrada |
| CONFIG_081 | 404 | Scoring rule não encontrada |

## PITCH — Geração pitch LLM

| Code | HTTP | Quando usar |
|------|------|-------------|
| PITCH_050 | 503 | LLM indisponível |
| PITCH_051 | 422 | Validação do pitch falhou |

## Resilience (TASK-19)

| Code | HTTP | Quando usar |
|------|------|-------------|
| MAINTENANCE_MODE | 503 | Env `MAINTENANCE_MODE=true` ativo; middleware redireciona para `/manutencao` |
| FORBIDDEN_ORIGIN | 403 | Origem de request fora da allow-list (futura CSRF/CORS granular) |
| RATE_LIMITED_GLOBAL | 429 | Rate-limit global (front mostra `OfflineBanner` estilo warning) |

---

## Convenções

- **Zero Silêncio:** toda chamada client-side deve mapear `error.code` para copy em `src/constants/errors.ts`. Códigos desconhecidos caem em `SYS_001` com errorId.
- **Correlação:** incluir `requestId` em `details` quando possível. Logs Sentry devem carregar o code como tag.
- **i18n-ready:** `userMessage` é pt-BR canônico. Quando i18n for plugado, ler de `locales/{lng}/errors.json` com mesma chave.
- **Novos códigos:** adicionar primeiro em `src/constants/errors.ts`, depois aqui. Nunca hardcodar strings nos endpoints.
