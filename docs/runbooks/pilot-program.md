# Runbook — Programa Piloto (M14)

| Campo | Valor |
|-------|-------|
| Versao | 1.0 |
| Data | 2026-04-29 |
| Origem | Milestone 14 — G-005 |
| Owner | Pedro Corgnati |

## Objetivo

Conduzir programa piloto com 5-10 operadores reais por 4 semanas, validando o produto em uso real e coletando dados para o estudo de caso (G-003) e relatorio de otimizacao (G-004).

---

## 1. Criterios de Selecao

Operador piloto deve atender:

- [ ] Tem necessidade concreta de prospeccao B2B (nao curiosidade)
- [ ] Disponibilidade minima de 2h/semana para uso real do produto
- [ ] Topa entrevista de 30min ao final (ver `pilot-interviews.md`)
- [ ] Concorda com termo de uso anonimizado para estudo de caso
- [ ] Perfil diversificado: pelo menos 3 nichos diferentes (ex: SaaS, varejo, servicos)
- [ ] Pelo menos 2 regioes diferentes (Sudeste, outras)
- [ ] Mix de portes: 1-2 freelas + 2-3 PME + 1-2 empresas medias
- [ ] Ja conhece minimamente o conceito de score de lead

**Anti-criterios (rejeitar):**
- Quer apenas comprar lista (nao vai usar o produto)
- Recursa entrevista
- Empresa concorrente direta

---

## 2. Processo de Convite

### 2.1 Lista de candidatos
Manter em `output/docs/lead-hunting-engine/marketing/PILOT-CANDIDATES.md` (gitignored — contem PII).

### 2.2 Email de convite (template)
```
Assunto: Voce esta na lista de pilotos do Lead Hunting Engine

Ola {nome},

Estou abrindo 5-10 vagas para piloto fechado do Lead Hunting Engine —
ferramenta que prospecta, qualifica e escora leads B2B automaticamente.

Por que voce: {razao especifica}.

O que oferecemos:
- Acesso completo gratuito por 4 semanas
- Onboarding 1:1 (30 min)
- Suporte direto comigo durante o piloto

O que pedimos:
- Uso real (pelo menos 2h/semana)
- Entrevista de 30 min ao final
- Permissao para uso anonimizado em estudo de caso

Topa? Responde com "sim" e te mando o convite.

— Pedro
```

### 2.3 Disparo do convite
Apos confirmacao verbal/email:
1. Aplicar tag `pilot-q2-2026` ao usuario via `/admin/users/{id}/tags` (G-010)
2. Disparar convite via `/admin/invites/new`
3. Registrar em `PILOT-LOG-W0.md`

---

## 3. Cadencia de Acompanhamento

### Semana 1 — Ativacao
- D+0: Convite aceito (evento `pilot_invite_accepted` rastreado)
- D+1 a D+3: Esperar 1a coleta espontanea
- D+4: Se sem coleta, enviar mensagem de check-in
- D+7: 1a primeira coleta concluida (evento `pilot_first_collection`)

**Marcos:** ativacao = primeira coleta concluida ate D+7.

### Semana 2 — Primeiros leads HOT
- Esperar pelo menos 1 lead HOT (evento `pilot_first_hot_lead`)
- Se nao houver: avaliar configuracao de scoring com o operador

### Semana 3 — Aprofundamento
- Operador deve estar usando >=2 features (coleta + dashboard, idealmente + pitch)
- Capturar feedback informal (chat/email)

### Semana 4 — Conversao + Entrevista
- Verificar se houve pelo menos 1 lead movido para CONTACTED ou CONVERTED
- Agendar entrevista de 30 min (ver `pilot-interviews.md`)

---

## 4. Metricas Acompanhadas (cohort `pilot-q2-2026`)

Acessar via `/admin/metrics?tag=pilot-q2-2026` (G-010 + G-011):

| Metrica | Meta semana 4 |
|---------|---------------|
| Ativacao (primeira coleta) | 80% |
| Pelo menos 1 lead HOT | 70% |
| Pelo menos 1 lead movido para CONTACTED | 50% |
| NPS medio (G-006) | >=8 |

---

## 5. Criterios de Sucesso do Piloto

- [ ] >= 5 operadores ativos por 4 semanas (taxa de retencao >=50%)
- [ ] NPS medio >= 8
- [ ] >= 3 entrevistas conduzidas e sintetizadas
- [ ] >= 1 caso elegivel para estudo (G-003)
- [ ] Backlog de >=10 insights priorizados em `PENDING-ACTIONS.md`

---

## 6. Escalonamento

| Sinal | Acao |
|-------|------|
| Operador inativo >7 dias | Mensagem direta de check-in |
| NPS detractor (<=6) submetido | Email automatico admin (G-020) + ligacao em 24h |
| Bug reportado afetando usabilidade | Issue no Linear/PENDING-ACTIONS.md como P0 |
| Operador desistiu | Substituir por candidato reserva |

---

## 7. Encerramento

Ao final das 4 semanas:
1. Compilar `PILOT-LOG-FINAL.md` com metricas finais cohort
2. Gerar `M14-HANDOFF-DECK.md` (ver template)
3. Selecionar 1 operador para G-003 (estudo de caso)
4. Registrar lessons em `output/docs/lead-hunting-engine/PIPELINE-PITFALLS.md` (se aplicavel)

---

## 8. Conformidade

- Cada operador piloto recebe e assina termo LGPD via convite
- Dados de uso anonimizados para qualquer publicacao externa
- Direito a remocao garantido (LGPD M9.4 ja operacional)
