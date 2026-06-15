# Design — Outreach por WhatsApp / Telefone

> Status: **Fases 0 e 1 implementadas** (2026-06-11). Fases 2–3 pendentes.
> Implementado: `phone-utils` (E.164/móvel BR), `SuppressionKind.PHONE` (migração
> `20260611120000_suppression_phone`), supressão por telefone, `applyOutcome`
> aceita `TELEFONE`, rotas `contact-queue`/`contact-outcome`, aba "Contato direto"
> no OutreachCenter. Backfill de telefone reusa `scripts/enrich-place-details.ts`.
> Contexto: o canal de cold **email** é um mismatch para o ICP (negócio SEM site
> raramente tem e-mail). Este doc desenha o canal certo — WhatsApp/telefone —
> reaproveitando a arquitetura de outreach já existente.

---

## 1. A verdade dos dados (lida do banco hoje)

| Métrica | Valor (dos 450 leads atuais) |
|---|---|
| Com e-mail | **0** |
| Com telefone | **23** |
| Telefone móvel (estimado, WhatsApp-capaz) | **~5** |
| Telefone fixo | **~18** |

**Conclusão dura:** o gargalo NÃO é a tela de envio — é a **captura de contato na
coleta**. Hoje o engine quase não persiste telefone, e o pouco que tem é fixo
(não serve para WhatsApp). Qualquer UI de WhatsApp linda sobre essa base envia
para ~5 números. Portanto a **Fase 0 (dados) é pré-requisito** das demais.

`hipotese`: o Google Places retorna `international_phone_number` para a maioria
dos estabelecimentos; a baixa cobertura indica que a coleta não está persistindo
o campo de forma confiável (a verificar na Fase 0).

---

## 2. Decisão de canal (a mais importante)

Cold outreach por WhatsApp tem três modelos de integração. A escolha define todo
o resto:

| Modelo | Como | Custo | Risco | Veredito |
|---|---|---|---|---|
| **A. Click-to-chat operator-driven** | App gera fila; operador clica `wa.me/<E164>?text=<pitch>` e `tel:`, fala, marca desfecho | Zero | Zero (não automatiza WhatsApp) | **RECOMENDADO agora** |
| **B. WhatsApp Cloud API (Meta oficial)** | Envio automático via API | Por conversa | **Alto**: cold a número não-opt-in viola política → ban; exige templates aprovados + conta verificada | Só Fase 3, e SÓ para janela de 24h pós-resposta ou opt-in |
| **C. Não-oficial (Z-API/Evolution/Baileys)** | Automatiza WhatsApp Web | Mensal | **Altíssimo**: viola ToS, bane número fácil | **Não usar** |

**Princípio:** para *cold*, o único caminho compatível é **operator-driven (A)**.
Aceita-se o trade-off explícito: **qualidade e conformidade > volume/automação.**
Automação real (B) só entra DEPOIS que o lead respondeu (janela de sessão de 24h)
ou deu opt-in — nunca cold automático.

---

## 3. Reuso da arquitetura existente (o que NÃO precisa ser criado)

A base de outreach já é multi-canal. Quase nada é novo:

- `enum ContactChannel { WHATSAPP, EMAIL, ... }` — **já tem WHATSAPP**.
- `enum OutreachChannel { EMAIL, WHATSAPP, LINKEDIN }` — `OutreachDispatch.channel`
  **já aceita WHATSAPP** (default EMAIL).
- `enum ContactOutcome { NO_ANSWER, INTERESTED, SENT, BOUNCED, OPT_OUT, REPLIED }`
  — cobre desfechos de ligação/WhatsApp.
- `lead-status-bridge.applyOutcome(...)` — máquina Lead.status ↔ ContactEvent,
  **reusável** para desfechos manuais.
- `pitch-bridge` — geração de pitch citando o problema real (sem site, etc).
  Reusável com um **template curto de WhatsApp** (não o corpo de e-mail).
- Funil/Saúde do OutreachCenter — já tem colunas; passa a contar dispatches
  WHATSAPP.

### O que é NOVO (mínimo)

1. `SuppressionKind.PHONE` (hoje só EMAIL/DOMAIN) — lista "não perturbe" por número.
2. Normalização **E.164 só-dígitos** para o link `wa.me` (hoje `phoneNormalized`
   guarda `+55 12 3145-2031` com espaços/hífen; `wa.me` precisa de `5512314...`).
   Opções: campo novo `phoneE164` OU normalizar no momento de montar o link.
3. Flag/heurística **móvel vs fixo** (BR: 9 dígitos após DDD começando com 9) —
   só móvel recebe botão WhatsApp; fixo recebe só botão Ligar.
4. **Eligibilidade por canal** (gate novo): WhatsApp = `phoneNormalized` presente +
   móvel + não-suprimido. **NÃO exige e-mail nem integrityScore≥60** (esses são do
   gate de e-mail; aqui o "hard" é ter número válido).

---

## 4. Fluxo do operador (UI nova: aba "Contato direto")

Uma nova aba no Centro de Outreach (ou painel próprio), worklist-driven:

1. Operador escolhe **público** (nicho, via o mesmo `<select>` de facetas).
2. Vê a **fila de contatos**: leads com telefone elegível, ordenados por score.
3. Cada item mostra: nome, telefone, **problema detectado** (sinais), e o
   **pitch de WhatsApp gerado** (curto, citando "vi que vocês não têm site...").
4. Botões por item:
   - **Abrir WhatsApp** → `https://wa.me/<E164>?text=<pitch urlencoded>` (só móvel)
   - **Ligar** → `tel:<E164>`
   - **Copiar mensagem**
5. Após o contato, marca **desfecho** (1 clique):
   `Falei/Enviei` · `Interessado` · `Não atendeu` · `Sem interesse` ·
   `Número errado/fixo` · `Pedir p/ não contatar` (→ supressão por telefone).
6. `applyOutcome` atualiza `Lead.status` + `ContactEvent` + funil.
   `Não atendeu` reagenda follow-up em N dias (cadência).

**Dispatch no modelo operator-driven:** cria `OutreachDispatch(channel=WHATSAPP,
status=SCHEDULED)` ao entrar na fila; vira `SENT` quando o operador confirma o
contato (não há confirmação de entrega automática no click-to-chat — o humano
confirma). Idempotência: partial-unique `(lead, channel)` já impede duplicar.

---

## 5. Rollout faseado

| Fase | Entrega | Desbloqueia | Esforço aprox. |
|---|---|---|---|
| **0 — Dados (pré-req)** | Normalizador E.164 + captura confiável de telefone na coleta + flag móvel/fixo + backfill de telefone (Google Places `international_phone_number`) | Ter para quem ligar/mandar | M |
| **1 — MVP operator-driven** | Aba "Contato direto": fila + `wa.me`/`tel:` + pitch WhatsApp + desfecho → status/funil + `SuppressionKind.PHONE` | Operador trabalha a base HOJE, sem API, sem risco | M–L |
| **2 — Cadência assistida** | Sequência multi-passo (WhatsApp → ligação → follow-up), templates por nicho, métricas por canal, reagendamento de "não atendeu" | Consistência e volume manual maior | M |
| **3 — API opt-in (opcional)** | WhatsApp Cloud API só para janela de 24h pós-resposta / opt-in | Automação de follow-up compatível | L (verificação Meta + templates) |

**Ordem de valor:** Fase 0 é o gargalo real (sem telefone não há fila). Fase 1 já
torna o produto utilizável para o canal certo. Fases 2–3 são otimização.

---

## 6. LGPD, ToS e riscos (honestos)

- **LGPD:** contato não solicitado por telefone/WhatsApp tem base legal discutível
  (legítimo interesse B2B vs. titular). **Opt-out tem que ser trivial e respeitado**
  → `SuppressionKind.PHONE` é obrigatório, não opcional. Registrar consentimento/
  base legal por contato.
- **WhatsApp ToS:** automação não-oficial (modelo C) bane número. Por isso o MVP é
  operator-driven. A Cloud API (B) proíbe cold a não-opt-in — respeitar.
- **Reputação/escala:** `wa.me` é manual (1 a 1). Não escala como e-mail automático.
  É o preço da conformidade. Volume vem de mais operadores ou de leads que respondem
  (aí entra a Fase 3).
- **Dados fixos:** ~80% dos telefones atuais são fixos. A UI deve esconder o botão
  WhatsApp para fixo (só Ligar), senão gera frustração ("abri e não existe").

---

## 7. Resumo executivo

O canal certo para o ICP (negócio sem site) é **WhatsApp/telefone**, e a
arquitetura de outreach **já o suporta** (ContactChannel/OutreachChannel.WHATSAPP,
dispatch, applyOutcome, pitch-bridge). O trabalho real divide-se em:
**(0) capturar telefone de verdade na coleta** — o gargalo —, e **(1) uma fila
operator-driven com `wa.me`/`tel:` + desfecho**, que é compatível, sem custo e sem
risco de ban. Automação via API fica para follow-up de quem já respondeu. Não
construir automação cold de WhatsApp: queima número e viola política.
