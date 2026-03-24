# Política de Exclusão de Conta (LGPD Art. 18)

**Versão:** 1.1
**Última revisão:** 2026-03-23
**Responsável:** Controlador de Dados — Lead Hunting Engine

---

## Visão Geral

Em conformidade com o Art. 18 da Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018), o usuário tem o direito de solicitar a exclusão de seus dados pessoais tratados com base no consentimento.

## Processo de Exclusão

1. **Solicitação:** O usuário acessa `/perfil` e clica em "Solicitar exclusão de conta".
2. **Confirmação:** Diálogo de confirmação exibe consequências e exige confirmação explícita.
3. **Registro:** O campo `deletionRequestedAt` (timestamp UTC) é preenchido via `POST /api/v1/profile/deletion-request`.
4. **Audit log:** Ação `user.deletion_requested` registrada na tabela `audit_logs` com `userId`, `resource`, `resourceId`, `requested_at` e `ipAddress`.
5. **Prazo de retenção:** Dados retidos por **15 dias** após `deletionRequestedAt` para fins de prevenção de fraude e obrigações legais (Art. 16, LGPD).
6. **Cascade Delete (job futuro):** Cron diário (Vercel Cron ou trigger.dev) busca registros com `deletionRequestedAt < NOW() - INTERVAL '15 days'` e executa exclusão permanente, incluindo remoção do usuário do Supabase Auth via Admin API.

## Campos Excluídos — Cascade Delete Detalhado

| Tabela | Ação | Trigger | Observação |
|--------|------|---------|------------|
| `user_profiles` | DELETE | Manual (cron job) | Registro principal; disparado após 15d |
| `collection_jobs` | DELETE CASCADE | Via FK `user_id` | Jobs de coleta vinculados |
| `raw_lead_data` | DELETE CASCADE | Via FK `user_id` | Dados brutos coletados |
| `leads` | DELETE CASCADE | Via FK `user_id` | Leads gerados pelo usuário |
| `data_provenance` | DELETE CASCADE | Via FK `lead_id` | Rastreabilidade de campos dos leads |
| `pitch_templates` | DELETE CASCADE | Via FK `user_id` | Templates de pitch personalizados |
| Supabase Auth (`auth.users`) | DELETE via Admin API | Chamada explícita do cron | Conta de autenticação — não tem CASCADE automático |

## Dados Retidos Após Exclusão (Evidência Legal)

| Tabela | Ação | Prazo de Retenção | Base Legal |
|--------|------|-------------------|-----------|
| `audit_logs` | `userId` → `NULL` (anonymize) | +30 dias após exclusão | Art. 16 LGPD — obrigação de auditoria e segurança |

> **Nota:** Registros de `audit_logs` sem PII (userId = NULL) são mantidos por 30 dias adicionais para fins de evidência legal e compliance de segurança.

## Segurança do Endpoint

- **Autenticação:** JWT obrigatório via Supabase Auth (`requireAuth()`)
- **Rate limit:** 5 requisições/minuto por usuário autenticado (documentado; implementação via Upstash Ratelimit ou middleware)
- **Idempotência:** Segunda solicitação retorna `USER_050` (409 Conflict) — `deletionRequestedAt` não é sobrescrito
- **Perfil ausente:** Retorna `USER_080` (404 Not Found) se `userProfile` não encontrado para o JWT informado

## Implementação Técnica

```
POST /api/v1/profile/deletion-request
  → requireAuth() → ProfileService.requestDeletion(userId)
    → findUnique (select deletionRequestedAt)
    → if null: update({ deletionRequestedAt: new Date() })
    → auditService.log({ action: 'user.deletion_requested', ... })
  → 200 { message: '...' }
  → 409 USER_050 (duplicata)
  → 404 USER_080 (perfil não encontrado)
  → 401 AUTH_001 (não autenticado)
```

## Referências Legais

- Lei nº 13.709/2018 — LGPD, Art. 18 (Direitos do titular de dados)
- Lei nº 13.709/2018 — LGPD, Art. 16 (Conservação de dados após término do tratamento)

## Pendências (Job Futuro)

- [ ] Implementar cron job diário para cascade delete de registros com `deletionRequestedAt < NOW() - 15d`
- [ ] Integrar Supabase Admin API para remoção de `auth.users`
- [ ] Anonimizar `audit_logs.user_id` → NULL antes do DELETE de `user_profiles`
- [ ] Implementar rate limiting via Upstash Ratelimit na rota
