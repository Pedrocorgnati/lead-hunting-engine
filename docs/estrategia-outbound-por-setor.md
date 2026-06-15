# Estratégia de prospecção por setor — Lead Hunting Engine

Documento de estratégia derivado da medição real de 2026-06-12 (ver `email-discovery-por-setor.md`). Define, por setor, qual canal priorizar, o ângulo de abordagem, a cadência e a configuração operacional no app. Princípio condutor: **o canal segue o dado** — onde há e-mail de qualidade, automatiza-se por e-mail; onde o e-mail é fraco, o WhatsApp manual vem primeiro.

## 1. Premissas de canal (o que o produto consegue fazer hoje)

- **E-mail é o único canal com transporte automático** (SMTP por caixa). Escala, agenda, suprime, mede bounce/resposta. É o canal de volume.
- **WhatsApp não tem transporte** — o produto entrega o link `wa.me` com a mensagem já renderizada (`GET /api/v1/admin/outreach/contact-queue`), para envio **manual** pelo operador. É o canal de alta conversão, baixo volume.
- **A fonte de e-mail é o crawler**, não o Google Places. Sem rodar `email-discovery-worker --apply`, o lead fica sem e-mail e não entra em campanha (gate `integrityScore >= 60` exige e-mail válido).
- Decorrência: a estratégia por setor é, na prática, **a proporção entre e-mail automático e WhatsApp manual** que cada setor justifica.

## 2. Classificação dos setores

Combinando volume de e-mail, qualidade de domínio e força do sinal de WhatsApp:

| Setor | E-mail (úteis/20) | Sinal WhatsApp | Canal primário | Canal secundário |
|---|---:|:--:|---|---|
| Imobiliária | 14 | baixo | **E-mail automático** | WhatsApp manual (sem resposta) |
| Agência de Marketing | 11 | alto | **E-mail** (ver ressalva §4) | WhatsApp |
| Contador | 5 | médio | **E-mail automático** | WhatsApp manual |
| Advogado | 4 | alto | **E-mail formal** + WhatsApp | — (cuidar de compliance) |
| Arquiteto | 6 | muito alto | **WhatsApp manual** | E-mail (filtrar domínio) |
| Dentista | 1 | alto | **WhatsApp manual** | E-mail (raro) |

Leitura: os três primeiros são "máquina de e-mail"; os três últimos são "WhatsApp primeiro, e-mail oportunista".

## 3. Ordem de ataque recomendada

Priorize por (volume de contato útil) × (clareza do ângulo) × (baixo risco de compliance):

1. **Imobiliária** — melhor e-mail do próprio domínio, ângulo cristalino, sem regulação de publicidade restritiva.
2. **Contador** — vivem de e-mail (canal nativo deles), ângulo claro de captação/área do cliente.
3. **Arquiteto** — WhatsApp altíssimo; conversão por mensagem direta com portfólio.
4. **Advogado** — bom alcance, mas exige tom formal e cuidado com publicidade (§5).
5. **Dentista** — WhatsApp primeiro; e-mail é exceção.
6. **Agência de Marketing** — reavaliar antes (são pares/concorrentes; §4).

## 4. Estratégia por setor

### Imobiliária — máquina de e-mail
- **Canal:** e-mail automático em volume; WhatsApp manual só nos sem resposta após 2 toques.
- **Ângulo:** "transformar quem busca imóvel no Google em contato no WhatsApp" — site com busca de imóveis, captura de lead, integração WhatsApp, painel de plantão.
- **`{{problema}}` típico:** dependência de portais (Viva Real/ZAP) que cobram por lead; ausência de site próprio que capture direto.
- **Cadência:** e-mail dia 0 → follow-up dia 3 → WhatsApp manual dia 7.

### Contador — e-mail nativo
- **Canal:** e-mail automático.
- **Ângulo:** site com captação de novos clientes + área do cliente (envio de documentos, agenda de obrigações) — reduz WhatsApp manual repetitivo do escritório.
- **`{{problema}}`:** site genérico/desatualizado; tudo resolvido no WhatsApp pessoal sem organização.
- **Cadência:** e-mail dia 0 → follow-up dia 4. Contador responde e-mail; pouca necessidade de WhatsApp.

### Arquiteto — WhatsApp com portfólio
- **Canal:** WhatsApp manual primeiro (sinal altíssimo: 18/20); e-mail como reforço, **com filtro de domínio canônico** (metade dos e-mails é de domínio externo, ex.: Behance/Instagram).
- **Ângulo:** site-portfólio visual que valoriza o projeto; agendamento de consulta. Mensagem com link de exemplo (`{{meu_portfolio}}`).
- **Cadência:** WhatsApp dia 0 (template "Prova/portfólio") → e-mail dia 2 se houver e-mail do próprio domínio.

### Advogado — formal e compliance-aware
- **Canal:** e-mail formal + WhatsApp; nunca tom de marketing agressivo.
- **Ângulo:** presença institucional sóbria, conforme as normas de publicidade da OAB (Provimento 205/2021) — você vende **infraestrutura digital ao escritório**, não captação de clientes para ele. Enfatizar discrição e conformidade.
- **`{{problema}}`:** site institucional ausente/amador que não passa credibilidade; metade dos e-mails veio de domínio externo, então **rodar o filtro de domínio canônico é obrigatório** aqui antes de qualquer apply.
- **Cadência:** e-mail formal dia 0 → follow-up único dia 5. Sem insistência (tom).

### Dentista — WhatsApp primeiro
- **Canal:** WhatsApp manual; e-mail é exceção (só 1 útil em 20).
- **Ângulo:** agendamento online + site com WhatsApp + conformidade com normas do CFO/CRO (publicidade odontológica regulada). Vender organização da agenda, não "atrair pacientes".
- **Cadência:** WhatsApp dia 0 → dia 4 (toque leve). Não investir e-mail em volume.

### Agência de Marketing — reavaliar (par/concorrente)
- **Ressalva:** agência de marketing frequentemente **já vende** presença digital — é concorrente, não cliente. O volume de e-mail é alto, mas a taxa de conversão como cliente tende a ser baixa.
- **Reposicionar antes de abordar:** ou tratar como **parceria/white-label** (você executa desenvolvimento que a agência revende), ou **excluir do funil de venda direta**.
- **Decisão pendente do operador:** definir se agência entra como lead de venda, lead de parceria, ou exclusão. Até decidir, **não disparar campanha de venda direta** para esse nicho.

## 5. Compliance e qualidade (gates inegociáveis)

- **LGPD (todos os setores):** outbound B2B por legítimo interesse exige finalidade clara, minimização, **opt-out em todo e-mail** e supressão respeitada. O produto já tem `suppression` + kill-switch; manter ligados.
- **Profissões reguladas (advogado, dentista, médico, contador):** as normas de publicidade regulam **a propaganda do profissional**, não a sua abordagem a ele — mas o **ângulo do pitch** deve refletir isso ("site que respeita as normas do seu conselho"), nunca prometer captação de clientes/pacientes.
- **Filtro de domínio canônico:** obrigatório em Advogado e Arquiteto (alto índice de domínio externo). O `email-discovery-worker` já classifica `external` e não o promove a primário — não desligar essa regra.
- **`integrityScore >= 60`** continua sendo o gate de elegibilidade de auto-outbound; e-mail genérico/externo não passa silenciosamente.

## 6. Execução no produto (passo a passo por setor)

Para cada setor escolhido:

1. **Coletar:** `POST /api/v1/jobs` com `{ city, state, niche, sources:["GOOGLE_MAPS"], limit }`; processar via `drain-local-queue`.
2. **Descobrir e-mail (setores e-mail-fortes):** `pnpm tsx scripts/run-email-discovery.ts --apply --niche "<setor>"`. Conferir o veredito de gate (T-03 found/scanned ≥ 8%, T-04 canônico/found ≥ 60%, T-05 externo/found ≤ 20%) antes do apply em produção.
3. **WhatsApp (setores WhatsApp-fortes):** `GET /api/v1/admin/outreach/contact-queue?niche=<setor>` → trabalhar os links `wa.me` manualmente (mensagem já renderizada).
4. **Template por setor:** criar variação do template de e-mail/WhatsApp com o `{{problema}}` e o ângulo do setor (placeholders disponíveis: `{{empresa}}`, `{{cidade}}`, `{{segmento}}`, `{{problema}}`, `{{meu_nome}}`, `{{minha_empresa}}`, `{{meu_whatsapp}}`, `{{meu_portfolio}}`).
5. **Campanha:** criar → `approve` → `arm` (libera envio real, exige production-preflight verde) → `enqueue`. Janela 09:00–18:00, `dailyCap` conforme a saúde da caixa.
6. **Higiene de funil:** rodar `run-contactability-job` (dry-run) para identificar leads sem nenhum canal após a descoberta; só fazer apply após decidir a política de retenção (`DEC-RETENCAO-DESCARTE`).

## 7. Métricas de acompanhamento por setor

Acompanhar, por nicho, para validar a estratégia com dados reais (não com a amostra de 20):

- **Cobertura:** found/scanned, canônico/found, e-mails do próprio domínio.
- **Entregabilidade:** taxa de bounce, taxa de SENT vs SUPPRESSED.
- **Conversão:** taxa de resposta por canal (e-mail vs WhatsApp), por setor.
- **Eficiência:** custo de coleta + crawl por lead contatável.

A estratégia acima é a hipótese de partida calibrada na amostra de 20/setor. A primeira rodada real de cada setor (100+ leads) confirma ou corrige a alocação de canal e a ordem de ataque.

## 8. Resumo de uma linha por setor

- **Imobiliária:** e-mail em volume, ângulo "capture quem busca no Google". Comece por aqui.
- **Contador:** e-mail nativo, ângulo "área do cliente + captação".
- **Arquiteto:** WhatsApp com portfólio; e-mail só do domínio próprio.
- **Advogado:** e-mail formal, compliance OAB, filtro de domínio obrigatório.
- **Dentista:** WhatsApp primeiro; e-mail é exceção.
- **Agência:** decidir parceria vs exclusão antes de gastar disparo.
