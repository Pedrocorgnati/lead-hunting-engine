# ADR: Impersonation de operador fora de escopo (item 059 / C8)

- **Status:** aceito
- **Data:** 2026-06-09
- **Contexto:** loop 05-27-lead-hunting-engine-explained, item 059 (admin UX).

## Decisao

O recurso de **impersonation** (admin "entrar como" um operador, com
`ImpersonationBanner` fixo no topo durante a sessao impersonada) esta
**fora de escopo** desta fase do produto.

## Contexto

A task C8 listava o `ImpersonationBanner` como criterio condicional ("se
impersonation existir"). A auditoria de 2026-06-09 confirmou que:

1. Nao ha backend de impersonation (nenhuma rota emite sessao em nome de
   terceiro, nenhum token de ator secundario no GoTrue).
2. O modelo de suporte atual (admin ve metricas, auditoria e sessoes do
   operador em `/admin/operadores/[id]` e pode revogar sessoes) cobre os
   casos de troubleshooting sem assumir a identidade do usuario.
3. Impersonation real exige trilha de auditoria propria (ator real vs ator
   aparente em TODO audit log), banner persistente, expiracao curta e
   re-auth — custo alto de seguranca para beneficio ainda nao demandado.

## Consequencias

- Nenhuma tela renderiza `ImpersonationBanner`; o componente nao existe e
  NAO deve ser criado preventivamente (Zero Orfaos).
- Se impersonation entrar em escopo no futuro, os pre-requisitos minimos
  sao: coluna `actingAdminId` no AuditLog, sessao com claim dedicada,
  banner global bloqueante e timeout maximo de 30 minutos.
