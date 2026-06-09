# ADR: Escopo estatico do conteudo institucional

**Status:** Aceito
**Data:** 2026-06-09
**Contexto da decisao:** Task C7 (`/admin/conteudo`, tela AD31) do loop `05-27-lead-hunting-engine-explained`
**Responsavel:** Equipe Lead Hunting Engine

---

## Contexto

A task C7 propunha um modulo administrativo completo de conteudo editorial em `/admin/conteudo`,
com plano editorial, pecas versionadas, agendamento, publicacao e remocao, exposto por uma
familia de endpoints (`/api/v1/admin/content/editorial-plan`, `/api/v1/admin/content/pieces`,
`/api/v1/admin/content/pieces/:id/{schedule,publish}`, etc.) alem de leitura/escrita do conteudo
institucional via `GET/PATCH /api/v1/admin/content/{landing,cases,terms,privacy}`.

O criterio de aceite e **binario**: ou existe um CMS administrativo com esses endpoints, ou existe
este ADR documentando que o conteudo institucional permanece estatico, referenciando explicitamente
**landing, cases, termos e privacidade**.

O Lead Hunting Engine e um motor B2B de prospeccao. O conteudo institucional muda raramente, exige
revisao juridica (termos e privacidade) e ja vive versionado no repositorio. Nao ha demanda de
produto, no escopo atual, para um pipeline editorial com agendamento e publicacao dinamica.

## Decisao

O conteudo institucional permanece **estatico e versionado por git**. Nao sera construido um CMS
administrativo com pecas, agendamento e publicacao dinamica. Os quatro dominios de conteudo tem
fonte unica no repositorio e sao alterados via Pull Request, herdando revisao de codigo e historico.

| Dominio   | Fonte estatica (repo)                                            | Renderizado em        |
|-----------|-----------------------------------------------------------------|-----------------------|
| landing   | `src/content/landing/{hero,pricing,faq}.json`                   | `/` (componentes Hero, Pricing, FAQ) |
| cases     | `src/content/cases/index.json`                                  | `/casos-de-uso` e `sitemap.ts` |
| termos    | `src/content/legal/terms-v1.md`                                 | `/termos` (via `LegalMarkdown`) |
| privacidade | `src/content/legal/privacy-v1.md`                             | `/privacidade` (via `LegalMarkdown`) |

A rota `/admin/conteudo` (AD31) NAO e um editor. Ela e uma **pagina de politica**: documenta para
administradores e operadores onde cada conteudo vive, como edita-lo (PR) e por que nao existe edicao
in-app. Assim a tela alvo existe, sem deadends, sem botoes orfaos e sem prometer endpoints inexistentes.

## Endpoints

Nenhum endpoint `/api/v1/admin/content/*` e exposto. As rotas `GET/PATCH /api/v1/admin/content/{landing,cases,terms,privacy}`
e toda a familia de pecas editoriais (`editorial-plan`, `pieces`, `schedule`, `publish`, `DELETE pieces/:id`)
ficam **deliberadamente nao implementadas** sob esta decisao. Qualquer necessidade futura de edicao in-app
exige novo ADR que supersede este, com avaliacao de versionamento, auditoria (audit log) e revisao juridica
para termos e privacidade.

## Consequencias

**Positivas**
- Conteudo institucional herda revisao de codigo, historico e rollback do git.
- Termos e privacidade mantem trilha de auditoria por PR, alinhada a LGPD (ver `docs/lgpd-deletion-policy.md`).
- Zero superficie de ataque administrativa para edicao de conteudo publico.
- Sem orfaos: a tela `/admin/conteudo` nao expoe acoes sem backend.

**Negativas / trade-offs**
- Atualizar conteudo exige deploy (PR + merge), nao edicao imediata por nao-tecnicos.
- Mitigacao: o conteudo institucional muda raramente; quando a cadencia justificar, reabrir a decisao.

## Superseder

Esta decisao deve ser revisitada se surgir demanda recorrente de edicao por usuarios nao-tecnicos
ou necessidade de agendamento de publicacao. Um ADR sucessor deve cobrir versionamento de pecas,
audit log de publicacao e o fluxo de aprovacao juridica para termos e privacidade.

## TODO opcional (P2) - versionamento de conteudo institucional

> Registro do escopo C7-extended (task 058 do loop `05-27-lead-hunting-engine-explained`).
> **Opcional e nao-bloqueante para o loop v1.** Nao ha trabalho exigido nesta iteracao; este
> bloco apenas documenta o passo seguinte caso a cadencia de mudanca justifique.

Como C7 optou pelo escopo estatico (este ADR), fica registrado o TODO opcional de, em iteracao
posterior, versionar explicitamente os quatro dominios institucionais hoje resolvidos por arquivo
unico. Isto e o meio-termo entre o estatico atual e o CMS dinamico recusado acima: nao introduz
endpoints `/api/v1/admin/content/*` nem editor in-app, apenas adiciona historico de versao nomeada
ao conteudo ja versionado por git.

| Dominio     | Fonte atual (v1)                            | Evolucao opcional (iteracao posterior)                     |
|-------------|---------------------------------------------|-------------------------------------------------------------|
| landing     | `src/content/landing/{hero,pricing,faq}.json` | manter; versionar via tag de release se houver A/B de copy |
| cases       | `src/content/cases/index.json`              | manter; sufixo de versao por caso se o catalogo crescer     |
| termos      | `src/content/legal/terms-v1.md`             | `terms-v2.md` ... preservando v1 para trilha juridica/LGPD |
| privacidade | `src/content/legal/privacy-v1.md`           | `privacy-v2.md` ... preservando v1 para trilha juridica/LGPD |

Disparadores para promover este TODO a task real:

- termos ou privacidade mudarem materialmente (gatilho juridico/LGPD - preservar a versao anterior em arquivo, nao so no git);
- necessidade de exibir ao usuario qual versao dos termos ele aceitou (consent timestamp -> versao);
- cadencia de edicao de landing/cases alta o suficiente para justificar fluxo editorial com preview/diff/publicacao/rollback (ramo "produto" de C7-extended), o que exigira o ADR sucessor descrito em `## Superseder`.

Enquanto nenhum disparador ocorrer, o escopo estatico decidido acima permanece suficiente e o loop v1
nao depende deste item.
