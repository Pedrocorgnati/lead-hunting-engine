# Runbook — Entrevistas com Pilotos (M14)

| Campo | Valor |
|-------|-------|
| Versao | 1.0 |
| Origem | M14 — G-007/G-014 |
| Owner | Pedro Corgnati |
| Duracao alvo | 30 min |

## Objetivo

Conduzir entrevistas semi-estruturadas com 5+ pilotos para validar hipoteses, descobrir frictions e priorizar evolucoes.

---

## 1. Pre-entrevista

- [ ] Agendar via Cal.com / Google Calendar
- [ ] Confirmar consentimento de gravacao via email (TERMO LGPD abaixo)
- [ ] Revisar metricas do operador na cohort (uso, leads, NPS)
- [ ] Preparar 2-3 perguntas customizadas baseadas em comportamento observado

---

## 2. Termo de Consentimento (LGPD)

```
Antes de comecarmos, preciso confirmar:

1. Voce concorda com a gravacao desta conversa para fins de melhoria do produto?
   (audio + transcricao automatica)

2. Voce concorda que insights anonimizados sejam usados em conteudo publico
   (LinkedIn, blog, portfolio)? Nada que identifique voce ou sua empresa.

3. A qualquer momento voce pode pedir para parar a gravacao ou remover
   trechos do registro (LGPD).

(aguardar confirmacao verbal explicita antes de iniciar gravacao)
```

Logar consentimento em `output/docs/lead-hunting-engine/marketing/PILOT-CONSENTS.md`:
```
- {nome anonimizado} | {data} | gravacao=SIM | uso anonimizado=SIM | observacoes
```

---

## 3. Roteiro (10 perguntas)

### Bloco 1 — Descoberta (3 perguntas)

**P1.** Antes de usar o Lead Hunting Engine, como voce fazia prospeccao? Me descreve o processo passo a passo.

**P2.** Qual era a maior dor desse processo? (escolha 1, nao 5)

**P3.** O que te fez aceitar fazer parte do piloto?

### Bloco 2 — Validacao (4 perguntas)

**P4.** Em uma escala de 0 a 10, quanto o produto resolveu sua dor original? (e por que esse numero?)

**P5.** Qual feature voce usou MAIS? Por que?

**P6.** Qual feature voce esperava usar mas NAO usou? Por que?

**P7.** Em algum momento voce ficou frustrado ou perdido? Me conta.

### Bloco 3 — Escala (3 perguntas)

**P8.** Se eu te oferecesse 12 meses gratis em troca de indicar 3 colegas, voce indicaria? Quem?

**P9.** Quanto voce pagaria por mes para usar este produto? (numero, nao faixa)

**P10.** O que precisaria existir/melhorar para voce pagar X (resposta da P9) sem hesitar?

---

## 4. Tecnica de Conducao

- **Pergunta aberta -> Silencio -> Aprofundamento**
  - Apos resposta, contar 3 segundos antes de responder. Frequentemente o operador adiciona o insight mais valioso nesse silencio.
- **5 Por Ques (quando conceito vago):** "Por que isso?", "Por que isso e importante?", etc.
- **Nunca defenda o produto.** Quando o operador critica, anote, agradeca e pergunte mais.
- **Nunca lidere a resposta.** Evitar "Voce gostou da feature X?" — preferir "Como foi sua experiencia com a parte de X?"

---

## 5. Pos-entrevista — Sintese

Em ate 24h apos a entrevista, criar `output/docs/lead-hunting-engine/marketing/INTERVIEW-{NN}-{slug}.md`:

```yaml
---
interview_id: NN
operator_anonymous: "Pedro M. (gerente comercial, distribuidora SP)"
date: YYYY-MM-DD
duration_min: 30
recording_url: "{link interno gravacao}"
nps_at_interview: 9
---

## Highlights

- Top quote: "..."
- Top insight: "..."
- Top friction: "..."

## Respostas resumidas

P1: ...
P2: ...
...

## Insights extraidos

| # | Insight | Categoria | Prioridade | Acao |
|---|---------|-----------|-----------|------|
| 1 | ... | bug/feature/friction/validation | P0/P1/P2/P3 | criar issue / discutir |

## Citacoes anonimizadas para uso externo

> "..."
```

---

## 6. Consolidacao

Apos 5+ entrevistas concluidas, consolidar em `PILOT-INTERVIEWS-SUMMARY.md`:

- Top 5 insights por frequencia
- Top 5 frictions por gravidade
- Distribuicao NPS
- Decisoes priorizadas (top 3 que viraram backlog)
- Quotes selecionadas para conteudo (com permissao)

---

## 7. Acoes derivadas

Cada insight de prioridade P0/P1 deve virar entrada em:
- `output/docs/lead-hunting-engine/PENDING-ACTIONS.md` secao "Insights de Piloto (M14)"
- Issue no GitHub se for bug/feature concreta
