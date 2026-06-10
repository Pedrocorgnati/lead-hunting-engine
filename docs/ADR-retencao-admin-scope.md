# ADR: escopo da administracao de retencao de dados (item 073 / C16)

- **Status:** aceito
- **Data:** 2026-06-10
- **Contexto:** loop 05-27-lead-hunting-engine-explained, item 073.

## Decisao

NAO criaremos uma familia dedicada `/api/v1/admin/retention/*` com CRUD de
politicas de retencao. A administracao de retencao e coberta pela composicao
de mecanismos ja existentes, e a tela AD31 `/admin/retencao` e um painel de
LEITURA sobre eles:

1. **Status**: `GET /api/v1/admin/privacy/retention-status` (ultima purga +
   leads expirando em 7/30 dias) — consumido pela tela.
2. **Execucao**: cron jobs `retention-cleanup`, `retention-sweep` e
   `lgpd-cleanup` (administraveis em `/admin/jobs/cron`: pause/resume e
   trigger manual com audit).
3. **Prazos**: chaves `retention.*` do SystemConfig (editaveis via
   `/admin/configuracoes`).
4. **Exclusao por titular**: fluxo DSAR (`/admin/dsar`).

## Justificativa

- Politicas de retencao mudam raramente e ja sao configuraveis via
  SystemConfig; um CRUD dedicado duplicaria a fonte de verdade.
- A execucao precisa de audit trail e pause/resume — exatamente o que o cron
  admin (AD29) ja fornece de forma generica.
- Reduz superficie de API com RBAC sensivel (purga de dados).

## Consequencias

- `/admin/retencao` mostra dados REAIS via retention-status (nao texto
  estatico) e linka para os mecanismos de acao.
- Se no futuro politicas por-entidade/por-tenant entrarem em escopo, ai sim
  nasce `/api/v1/admin/retention/policies` com versionamento e audit proprio.
