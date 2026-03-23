# Backend Build Report

Projeto: lead-hunting-engine
Stack: nextjs-api (Next.js 16 App Router API Routes)
ORM: Prisma 7.5.0 + PostgreSQL (Supabase)
Auth: Supabase Auth (@supabase/ssr) + JWT
Data: 2026-03-22

## Estrutura Gerada

### Prisma Schema (10 entidades, 7 enums)

| Entidade | Campos | Relacionamentos |
|----------|--------|-----------------|
| UserProfile | id, email, name, role, avatarUrl, termsAcceptedAt, deletionRequestedAt | 1:N Invite, Job, Lead, RawLeadData, PitchTemplate, AuditLog |
| Invite | id, email, role, status, token, invitedById, expiresAt, acceptedAt | N:1 UserProfile |
| CollectionJob | id, userId, status, city, state, country, niche, sources[], limitVal, processedLeads, errorLog | N:1 User, 1:N RawLeadData, 1:N Lead |
| RawLeadData | id, jobId, userId, source, businessName, phone, enrichmentStatus, rawJson | N:1 Job, N:1 User, N:1 Lead, 1:N DataProvenance |
| Lead | id, userId, jobId, status, businessName, score, temperature, opportunities[], problems[], pitchContent, notes | N:1 User, N:1 Job, 1:N RawLeadData, 1:N DataProvenance |
| DataProvenance | id, leadId, source, sourceUrl, collectedAt, confidence | N:1 Lead, N:1 RawLeadData |
| PitchTemplate | id, userId, name, content, tone, isFavorite | N:1 User |
| ApiCredential | id, provider, encryptedKey, iv, isActive, usageCount | Standalone (admin-only) |
| ScoringRule | id, name, slug, weight, isActive, condition (JSONB), sortOrder | Standalone (admin-only) |
| AuditLog | id, userId, action, resource, resourceId, metadata, ipAddress | N:1 User (INSERT-only) |

### Routes / Controllers (29 arquivos, 33 endpoints)

| Tag | Endpoints | Path Base |
|-----|-----------|-----------|
| auth | POST login, POST logout, POST reset-password, POST update-password | `/api/v1/auth/` |
| profile | GET, PATCH profile, POST deletion-request, GET data-export | `/api/v1/profile/` |
| invites (public) | GET [token], POST [token]/activate | `/api/v1/invites/` |
| admin-invites | GET, POST, POST [id]/resend, DELETE [id] | `/api/v1/admin/invites/` |
| jobs | GET, POST, GET [id]/status, DELETE [id] | `/api/v1/jobs/` |
| leads | GET, GET count, GET export, GET [id], PATCH [id]/status, PATCH [id]/notes, PATCH [id]/pitch, POST [id]/regenerate-pitch, POST [id]/false-positive | `/api/v1/leads/` |
| admin-config | GET credentials, PUT/DELETE credentials/[provider], GET scoring-rules, PATCH scoring-rules/[id], POST scoring-rules/reset | `/api/v1/admin/config/` |

### Middlewares

| Arquivo | Funcao |
|---------|--------|
| `src/middleware.ts` | Supabase session refresh + auth redirect |
| `src/lib/supabase/middleware.ts` | Cookie-based session management |
| `src/lib/auth.ts` | requireAuth(), requireAdmin(), ownership check helpers |

### Services (7 services)

| Service | Metodos |
|---------|---------|
| AuthService | signIn, signOut, resetPassword, updatePassword |
| ProfileService | findById, update, requestDeletion, exportData |
| InviteService | findAll, create, findByToken, activate, resend, revoke |
| JobService | findAllByUser, create, getStatus, cancel, countConcurrent |
| LeadService | findAll, findById, count, updateStatus, updateNotes, updatePitch, regeneratePitch, markFalsePositive, exportCsv |
| ConfigService | getCredentials, upsertCredential, deleteCredential, getScoringRules, updateScoringRule, resetScoringRules |
| AuditService | log (funcional — insere em audit_logs com sanitizacao de PII) |

### Schemas de Validacao (7 arquivos, 14 schemas Zod v4)

- `auth.schema.ts`: SignInSchema, ResetPasswordSchema, UpdatePasswordSchema
- `profile.schema.ts`: UpdateProfileSchema (strict — rejeita campos extras como `role`)
- `invite.schema.ts`: CreateInviteSchema, ActivateAccountSchema
- `job.schema.ts`: CreateJobSchema
- `lead.schema.ts`: UpdateLeadStatusSchema, UpdateLeadNotesSchema, UpdateLeadPitchSchema, RegeneratePitchSchema, MarkFalsePositiveSchema, LeadListQuerySchema
- `config.schema.ts`: UpsertCredentialSchema, UpdateScoringRuleSchema

### Infraestrutura

| Arquivo | Funcao |
|---------|--------|
| `src/constants/errors.ts` | 38 codigos de erro do ERROR-CATALOG (VAL, SYS, AUTH, RATE, USER, INVITE, JOB, LEAD, EXPORT, CONFIG, PITCH) |
| `src/lib/crypto.ts` | AES-256-GCM encrypt/decrypt para API credentials |
| `src/lib/prisma.ts` | Singleton Prisma Client com lazy proxy (build-safe) |
| `src/lib/api-utils.ts` | successResponse, paginatedResponse, handleApiError |
| `src/lib/supabase/server.ts` | Server-side Supabase client (@supabase/ssr) |
| `src/lib/supabase/client.ts` | Browser-side Supabase client |
| `.env.example` | Template com todas as variaveis necessarias |

### Testes Base (5 arquivos)

- `lead.service.test.ts`: findAll, findById, count, updateStatus, exportCsv
- `job.service.test.ts`: findAllByUser, create, getStatus, countConcurrent
- `config.service.test.ts`: getCredentials, getScoringRules, upsertCredential, resetScoringRules
- `invite.service.test.ts`: findAll, findByToken, create
- `profile.service.test.ts`: update, requestDeletion, exportData

## Build

- **TypeScript (`tsc --noEmit`):** PASSOU (0 erros)
- **Next.js build:** PASSOU (compilado com sucesso)

## Stubs Pendentes

Os seguintes metodos sao stubs e precisam de implementacao:

**AuthService:** signIn, signOut, updatePassword
**ProfileService:** update, requestDeletion, exportData
**InviteService:** create, findByToken, activate, resend, revoke
**JobService:** findAllByUser, create, getStatus, cancel, countConcurrent
**LeadService:** findAll, findById, updateStatus, updateNotes, updatePitch, regeneratePitch, markFalsePositive, exportCsv
**ConfigService:** getCredentials, upsertCredential, deleteCredential, getScoringRules, updateScoringRule, resetScoringRules

**Total: 30 metodos stub** marcados com `// TODO: Implementar via /auto-flow execute`

## Proximos Passos

1. `/build-verify .claude/projects/lead-hunting-engine.json` — verificar build integrado FE+BE
2. `/db-migration-create .claude/projects/lead-hunting-engine.json` — gerar migrations do banco
3. `/env-creation .claude/projects/lead-hunting-engine.json` — configurar variaveis de ambiente
4. `/create-test-user .claude/projects/lead-hunting-engine.json` — criar usuarios de teste
5. `/auto-flow execute .claude/projects/lead-hunting-engine.json` — implementar logica de negocio task a task
