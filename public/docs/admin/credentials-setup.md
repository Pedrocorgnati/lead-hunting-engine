# Como obter chave de API por provedor

Este guia ajuda administradores a obter as chaves de API dos 5 provedores externos suportados pelo Lead Hunting Engine. Todas as chaves sao armazenadas com criptografia AES-256-GCM no Cofre de Credenciais e nunca expostas em plaintext na interface.

Para cada provedor, voce vai:
1. Criar a conta no provedor
2. Gerar uma chave de API com o escopo correto
3. Colar em **Configuracoes → Credenciais → Adicionar** e clicar em **Testar**

> **Atencao a custos:** os valores abaixo sao estimativas para o volume tipico do Lead Hunting Engine. Os custos sao cobrados diretamente pelo provedor — o sistema apenas monitora consumo via guardas de custo.

---

## 1. Google Places API

**Para que serve:** descoberta de leads por busca textual e geolocalizacao.

**Onde obter:**
1. Acesse https://console.cloud.google.com/
2. Crie um projeto (ou selecione um existente)
3. Em **APIs & Services → Library**, ative **Places API (New)**
4. Em **APIs & Services → Credentials**, clique **Create Credentials → API key**
5. Restrinja a chave: **Application restrictions: HTTP referrers** ou **None** (para uso server-side); **API restrictions: Places API**

**Escopo:** apenas Places API (Text Search + Place Details).

**Custo estimado:** US$ 0,017 por busca de texto (Text Search). Volume tipico de 1.000 buscas/mes = ~R$ 90/mes.

**Tempo medio para ativacao:** imediato apos criar a key.

---

## 2. Outscraper

**Para que serve:** scraping de Google Maps em escala (alternativa/complemento ao Google Places).

**Onde obter:**
1. Acesse https://app.outscraper.com/api-key
2. Crie a conta e faca login
3. Copie o token exibido no painel

**Escopo:** todo o produto (token unico do app).

**Custo estimado:** US$ 0,002 a US$ 0,01 por lead coletado (varia por volume contratado). Volume tipico de 10.000 leads/mes = ~R$ 100–500/mes.

**Tempo medio para ativacao:** imediato. Plano free disponivel para testes (500 creditos).

---

## 3. Apify

**Para que serve:** scraping multi-fonte (LinkedIn Sales Navigator, Instagram Business, Yelp etc) via actors.

**Onde obter:**
1. Acesse https://console.apify.com/account#/integrations
2. Faca login (ou crie conta)
3. Em **API Tokens → Create new token**, gere um token com permissao **All accesses**
4. Copie o token

**Escopo:** todo o conjunto de actors da conta.

**Custo estimado:** US$ 0,002 a US$ 0,01 por lead coletado. Volume tipico de 10.000 leads/mes = ~R$ 100–500/mes.

**Tempo medio para ativacao:** imediato. Plano free disponivel (US$ 5 de creditos mensais recorrentes).

---

## 4. OpenAI

**Para que serve:** geracao de pitch personalizado por lead (module-13-intelligence-pitch).

**Onde obter:**
1. Acesse https://platform.openai.com/api-keys
2. Faca login com a conta da empresa
3. Clique **Create new secret key** e nomeie como `lead-hunting-engine-prod`
4. Copie a chave (formato `sk-...`) — ela so e exibida uma vez
5. Configure billing em **Settings → Billing** (obrigatorio para uso de API)

**Escopo:** restrito ao projeto Lead Hunting Engine. Recomenda-se criar **Project API key** (nao **User key**) e limite de gasto mensal (ex: US$ 50/mes) em **Settings → Limits**.

**Custo estimado:** US$ 0,01 a US$ 0,05 por lead processado (limite de 4096 tokens/pitch). Volume tipico de 1.000 pitches/mes = ~R$ 50–250/mes.

**Tempo medio para ativacao:** ~5 minutos apos configurar billing.

---

## 5. Anthropic

**Para que serve:** geracao de pitch personalizado (alternativa/complemento ao OpenAI no module-13).

**Onde obter:**
1. Acesse https://console.anthropic.com/settings/keys
2. Faca login (ou crie conta)
3. Em **Workspaces**, escolha (ou crie) um workspace para o produto
4. Clique **Create Key** e nomeie como `lead-hunting-engine-prod`
5. Copie a chave (formato `sk-ant-...`) — ela so e exibida uma vez

**Escopo:** restrito ao workspace. Defina limite de gasto mensal em **Plans & Billing**.

**Custo estimado:** US$ 0,01 a US$ 0,05 por lead processado. Volume tipico de 1.000 pitches/mes = ~R$ 50–250/mes.

**Tempo medio para ativacao:** ~5 minutos apos confirmar email + billing.

---

## Apos cadastrar a chave

1. Em **Configuracoes → Credenciais**, clique no card do provider e use o botao **Testar** — o sistema chama o endpoint do provider e confirma se a chave e valida.
2. Se o teste falhar, revise:
   - A chave foi colada por inteiro (sem espacos extras)?
   - O provedor exige billing configurado (OpenAI, Anthropic)?
   - A chave tem o escopo correto (Places API ativada no Google Cloud)?
3. Use o painel **Metricas** (`/admin/metricas`) para acompanhar consumo agregado por provedor (cards "Uso de API" e "Custo de LLM").

## Seguranca

- Voce nunca vera a chave em plaintext apos salvar — apenas o formato mascarado `AIza****abcd`
- Toda acao admin (criar, editar, testar, excluir credencial) e registrada em `/admin/audit-log` com `correlationId` e `userId`
- Se uma chave vazar, **revogue no provedor primeiro** (dashboard do provider) e depois exclua a credencial em **Configuracoes**
- A chave fica criptografada com AES-256-GCM no banco usando a `ENCRYPTION_KEY` do servidor (rotacao da master key requer suporte tecnico)

## Suporte

Em caso de duvida sobre qual provider escolher, consulte `output/docs/lead-hunting-engine/BUDGET.md` secao **CUSTOS ADICIONAIS** ou abra ticket no canal de suporte.
