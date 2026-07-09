# Relatorio de usabilidade do cliente final

Workspace escaneado: output/workspace/lead-hunting-engine
Arquivos analisados: 873
Total de sinais de fricao: 154

> Cada achado abaixo cruza as tres disciplinas que se sobrepoem: **Arquitetura de Informacao** (onde a coisa mora), **Hierarquia Visual** (o quanto ela salta aos olhos) e **Usabilidade** (se a pessoa consegue usar sem manual). Nenhum sinal foi inventado nem recontado: tudo vem de `usability-signals.json`.

## Resumo contavel

- Navegacao sobrecarregada (Miller 7+-2 / Hick): **1**
- CTAs concorrentes (Fitts / Von Restorff / Hierarquia Visual): **6**
- Acao sem feedback (Nielsen H1 / Zero Silencio): **20**
- Funcao critica escondida (Nielsen H6 / Progressive Disclosure): **127**

---

## Achados

### 1. Navegacao sobrecarregada (1 sinal)
**Disciplinas:** Arquitetura de Informacao + Usabilidade. **Lei:** Miller (7+-2) + Hick.

Quando uma tela oferece mais de 7 opcoes no mesmo nivel, o cliente para de "ler" e comeca a "procurar". Cada opcao extra aumenta o tempo de decisao (Hick) e estoura o limite de itens que a memoria de trabalho segura (Miller). Para o leigo, e a sensacao de "tem coisa demais aqui, nao sei onde clicar".

| Arquivo | Itens no topo | Correcao sugerida |
|---|---|---|
| `src/app/(app)/admin/jobs/[id]/page.tsx` | 8 (limite 7) | reduzir itens top-level a <=7; rebaixar os raros para um menu "mais" (Progressive Disclosure), **sem deletar** nada. |

*Lente extra (Nielsen H8 - Minimalist Design):* o item que passou de 7 quase sempre e um botao secundario que pode virar acao de overflow.

---

### 2. CTAs concorrentes (6 sinais)
**Disciplinas:** Hierarquia Visual + Usabilidade. **Lei:** Fitts + Von Restorff + Hierarquia Visual.

Quando dois ou mais botoes tem o **mesmo peso visual** (mesma cor forte, mesmo tamanho), nenhum se destaca. O efeito Von Restorff diz que so o que e diferente chama atencao: se tudo grita, nada e ouvido. O cliente final hesita sobre qual e "o botao certo". A regra e simples: **1 CTA primario por agrupamento**; o resto vai para variante neutra (ghost/outline).

| Arquivo | CTAs primarios competindo | Correcao sugerida |
|---|---|---|
| `src/app/(app)/admin/outreach/_components/OutreachCenter.tsx` | 4 | manter 1 primario; demais em ghost/outline. |
| `src/components/profile/deletion-request-section.tsx` | 3 | manter 1 primario; demais em ghost/outline. |
| `src/app/(app)/perfil/privacidade/page.tsx` | 2 | manter 1 primario; demais em ghost/outline. |
| `src/components/admin/ScoringImpactPreview.tsx` | 2 | manter 1 primario; demais em ghost/outline. |
| `src/components/ui/dropdown-menu.tsx` | 8 | componente base; revisar se os itens herdam peso de primario por engano. |
| `src/components/ui/tabs.tsx` | 2 | componente base; idem. |

*Nota:* `dropdown-menu.tsx` e `tabs.tsx` sao componentes de UI reutilizaveis — corrigir o peso visual neles propaga a correcao para varias telas de uma vez.

---

### 3. Acao sem feedback (20 sinais)
**Disciplinas:** Usabilidade (e regra inviolavel **Zero Silencio**). **Lei:** Nielsen H1 (Visibilidade do estado do sistema).

Aqui o cliente faz algo (clica, envia, confirma) e a tela nao responde de forma explicita — sem toast, sem spinner, sem redirect, sem mensagem de erro. Para a pessoa leiga, parece que "nao aconteceu nada" e ela clica de novo, gerando acao duplicada ou desconfianca. Toda acao precisa de um sinal visivel de que foi recebida e do resultado.

Telas e componentes interativos com handler mas sem feedback evidente detectado:

- **Telas de erro (precisam de acao de recuperacao visivel):** `src/app/global-error.tsx`, `src/app/(app)/coletas/error.tsx`, `src/app/(app)/coletas/[id]/error.tsx`, `src/app/(app)/admin/error.tsx`, `src/app/(app)/leads/error.tsx`
- **Fluxo de pitch/templates:** `src/app/(app)/templates/pitch/page.tsx`, `src/app/(app)/templates/pitch/[id]/page.tsx`, `src/app/(app)/templates/pitch/novo/page.tsx`
- **Dashboard e navegacao:** `src/app/(app)/dashboard/_components/SourcePerformance.tsx`, `src/components/shared/sidebar.tsx`, `src/components/shared/nav-item.tsx`
- **Banners e widgets:** `src/components/NotificationPermissionBanner.tsx`, `src/components/consent/ConsentReceiptWidget.tsx`, `src/components/export/export-page-content.tsx`, `src/components/mobile/bottom-sheet.tsx`, `src/components/dev/DataTestOverlay.tsx`
- **Rotas de API (a contraparte de UI precisa traduzir o resultado em feedback):** `src/app/api/v1/profile/dsar/requests/route.ts`, `src/app/api/v1/admin/audit-log/_query.ts`, `src/app/api/v1/admin/outreach/mailboxes/route.ts`, `src/app/api/v1/leads/[id]/undo/route.ts`

**Correcao sugerida (todos):** toda acao precisa de feedback explicito — toast de sucesso/erro, estado de loading no botao, redirect claro, ou mensagem inline. As telas `error.tsx` precisam de um botao de "tentar de novo" / "voltar" visivel, nao so o texto do erro.

---

### 4. Funcao critica escondida (127 sinais)
**Disciplinas:** Arquitetura de Informacao + Usabilidade. **Lei:** Nielsen H6 (Reconhecer em vez de lembrar) + Progressive Disclosure.

Estes sao acoes/telas importantes que so se alcanca apos 3 niveis ou mais de profundidade a partir da raiz da tarefa. O cliente final nao "lembra" que o caminho existe (H6 pede reconhecer, nao decorar) — entao a funcionalidade existe, mas ninguem usa. A regra de bolso: **acao critica deve estar a no maximo 2 niveis** da raiz da tarefa; o que for mais raro pode ficar escondido, mas o que for de uso comum precisa subir.

> Importante (lente Lei de Jakob): varios destes sao componentes profundamente aninhados que podem estar OK se forem alcancados por um atalho de UI (aba, card, botao na tela pai). O sinal aponta *profundidade estrutural*; a fase DEFINIR-NAV (`/frontend:audit`) decide quais realmente precisam subir. Abaixo estao agrupados por area para facilitar essa decisao.

**Area Admin (37) — a mais afetada; muita configuracao critica enterrada a 5-7 niveis:**
`admin/error.tsx`, `admin/alertas/page.tsx`, `admin/convites/page.tsx`, `admin/api-usage/page.tsx`, `admin/operadores/page.tsx`, `admin/operadores/[id]/page.tsx`, `admin/dlq/page.tsx`, `admin/feature-flags/page.tsx`, `admin/users/page.tsx`, `admin/retencao/page.tsx`, `admin/jobs/cron/page.tsx`, `admin/jobs/fila/page.tsx`, `admin/jobs/[id]/page.tsx`, `admin/configuracoes/page.tsx`, `admin/configuracoes/privacidade/_components/TriggerCleanupButton.tsx` (depth 7 - o mais fundo), `admin/scoring/versoes/page.tsx`, `admin/config/regions/page.tsx`, `admin/config/niches/page.tsx`, `admin/config/limits/page.tsx`, `admin/config/scoring/page.tsx`, `admin/manutencao/page.tsx`, `admin/credenciais/page.tsx`, `admin/dsar/page.tsx`, `admin/metricas/page.tsx`, `admin/classificacao/page.tsx` (+ `ClassificationPreviewPanel.tsx`), `admin/outreach/_components/OutreachCenter.tsx`, e os cards/tabelas admin: `credential-form.tsx`, `AlertsSettings.tsx`, `ContactMessagesTable.tsx`, `MetricsComparePanel.tsx`, `ApiUsageBreakdown.tsx`, `PilotProgramDashboard.tsx`, `AuditLogTable.tsx`, `credential-card.tsx`, `ScoringRuleVersionCompare.tsx`, `RadarUsageChart.tsx`, `scoring-rules-form.tsx`, `ScoringRuleHistoryModal.tsx`, `CopyCredentialButton.tsx`, `WaitlistTable.tsx`, `EcuReportCard.tsx`.

**Area Coletas (10) — fluxo operacional principal, varios botoes de acao a 6 niveis:**
`coletas/error.tsx`, `coletas/page.tsx`, `coletas/nova/page.tsx`, `coletas/[id]/error.tsx`, `coletas/[id]/erros/page.tsx`, e os botoes de controle de execucao: `CancelButton.tsx`, `LiveProgressPanel.tsx`, `ResumeButton.tsx`, `ExportPartialButton.tsx`, `CopyButton.tsx`, `RetryButton.tsx` (todos depth 6).

**Area Leads (20) — o coracao do produto; acoes de qualificacao escondidas:**
`leads/error.tsx`, `leads/page.tsx`, `leads/comparar/page.tsx`, `leads/[id]/_components/` (`BudgetFlowExport.tsx`, `TagsEditor.tsx`, `NotesEditor.tsx`, `Attachments.tsx`, `RecomputeButton.tsx`), `leads/_components/` (`LeadsPagination.tsx`, `ExportButton.tsx`), e os componentes de leads: `PipelineTimeline.tsx`, `lead-notes-editor.tsx`, `lead-detail-interactive.tsx`, `SavedViewsBar.tsx`, `ContactEventForm.tsx`, `DuplicateResolver.tsx`, `LeadScoreBreakdown.tsx`, `pitch-card.tsx`, `AddToCampaignButton.tsx`, `BulkAddToCampaign.tsx`, `budget-flow.tsx`, `PitchTemplateFallback.tsx`, `lead-radar-tab.tsx`, `lead-tasks-panel.tsx`, `PitchHistoryDrawer.tsx`, `LeadTagsEditor.tsx`, `lifecycle-tracker.tsx`.

**Area Perfil/Conta/Auth (12):**
`perfil/page.tsx`, `perfil/seguranca/page.tsx`, `perfil/privacidade/page.tsx`, `settings/sessions/page.tsx`, `notifications/page.tsx`, `(auth)/login/login-form.tsx` (depth 4), `(auth)/invite/[token]/invite-activation-form.tsx` (depth 5), `recuperar-senha/page.tsx`, `auth/reset-password/page.tsx`, `auth/reset-password/update/page.tsx`, `components/profile/` (`deletion-request-section.tsx`, `profile-form.tsx`, `AvatarUploader.tsx`), `components/auth/ReauthDialog.tsx`.

**Area Radar / Dashboard / Export (9):**
`radar/_components/RadarLiveRefresher.tsx`, `radar/_components/RadarActions.tsx`, `RadarRecollectButton.tsx`, `dashboard/_components/DashboardMetrics.tsx`, `dashboard/_components/SourcePerformance.tsx`, `exportar/budgetflow/page.tsx`, `components/export/export-form.tsx`, `components/export/export-page-content.tsx`, `components/exports/ExportHistoryTable.tsx`.

**Componentes de UI/feedback/landing genericos (≈39) — depth 3, provavelmente OK se tiverem atalho de UI:**
landing (`WaitlistForm.tsx`, `CookieBanner.tsx`, `ContactForm.tsx`), erros (`error-experience.tsx`, `ui/error-boundary.tsx`), shared (`sidebar.tsx`, `header.tsx`, `DataState.tsx`), ui base (`theme-toggle.tsx`, `loading-button.tsx`, `dialog.tsx`, `pagination.tsx`, `modal.tsx`), feedback (`NpsWidget.tsx`), notifications (`NotificationPreferencesForm.tsx`), consent (`ConsentReceiptWidget.tsx`), mobile (`bottom-sheet.tsx`), dev (`DataTestOverlay.tsx`), `manutencao/MaintenancePageClient.tsx`, `erro/429/page.tsx`.

**Correcao sugerida (todos):** para cada acao que o cliente usa no dia a dia, garantir um caminho de <=2 niveis (atalho na tela pai, item de menu, card clicavel). Os que sao raros/administrativos podem permanecer fundos, mas devem aparecer num indice navegavel para nao virarem funcionalidade-fantasma.

---

## Como ler este relatorio

- Cada item descreve o **estado atual** do front-end e a **correcao sugerida**, em linguagem do dia a dia.
- Os numeros vem de **sinais estaticos contaveis** na propria tela (contagem de itens, peso de botoes, profundidade de pasta) — **sem nenhum dado de uso/telemetria**.
- Profundidade alta (categoria 4) e um *indicio* de fricao, nao uma sentenca: a fase DEFINIR-NAV (consumindo `/frontend:audit`) decide quais acoes realmente precisam subir na navegacao.
- Este relatorio nao altera codigo. As correcoes acontecem nas fases IMPLANTAR (`/front-end-build`, `/execute-task`, `/front-end-obvious`, `/tools:layout-upd`) e REVISAR (`/front-end-review`, `/review-executed-module`); o manual leigo final sai em `/instruction-manual`.
- Sinais brutos (JSON): `output/workspace/lead-hunting-engine/usability/usability-signals.json`.
