# Descoberta de e-mail por setor — Lead Hunting Engine

Teste E2E executado em 2026-06-12 no app rodando localmente (build de produção), com coleta real via Google Places e descoberta de e-mail via crawler `email-discovery-worker` (dry-run, zero escrita). Objetivo: medir quantos e-mails o pipeline encontra em setores de maior maturidade digital, em contraste com o nicho de restaurantes (que rendeu zero).

## TL;DR

- **64 e-mails descobertos em 120 leads** de 6 setores profissionais (53%), contra **0 e-mails em 20 restaurantes**.
- O Google Places **nunca** entrega e-mail (não existe campo de e-mail na API). Todo e-mail vem do **crawler** que entra no site do lead. Logo, **e-mail só aparece onde o lead tem site próprio** — e é isso que separa os setores.
- Melhores setores por volume e qualidade: **Imobiliária (16)** e **Agência de Marketing (15)**. Piores: **Dentista (5)** e o baseline **Restaurante (0)**.
- WhatsApp continua abundante em todos os setores (sinal "provável" por celular BR + confirmações por crawl), reforçando que é o canal universal; e-mail é o canal que varia por setor.

## Metodologia

- **Amostra:** 20 leads por setor, fonte `GOOGLE_MAPS`.
- **Cidade:** São José dos Campos/SP (cidade grande do Vale do Paraíba, alta maturidade digital) para os 6 setores profissionais. O baseline de Restaurante foi em Pindamonhangaba/SP (cidade média) — a diferença de cidade é parte do ponto: setor + porte do mercado determinam a presença de site.
- **Coleta:** `POST /api/v1/jobs` → fila local → `drain-local-queue` (coleta + enriquecimento), via interfaces reais do app.
- **Descoberta de e-mail:** `email-discovery-worker` em dry-run, que faz fetch SSRF-safe do site de cada lead e extrai e-mail de HTML/`mailto`/JSON-LD, classificando o domínio.
- **`scanned`** = leads com site e sem e-mail (elegíveis ao crawler). **`found`** = e-mails encontrados. **Qualidade do domínio:** `canônico` (e-mail do próprio domínio do site, melhor), `externo` (domínio de terceiro — agência, plataforma, portal; menor qualidade), `pessoal` (nome próprio no domínio do site).

## Estatística por setor

| Setor | Coletados | Com site | Sites varridos | E-mails encontrados | Taxa (found/scanned) | WhatsApp provável |
|---|---:|---:|---:|---:|---:|---:|
| Imobiliária | 20 | 20 | 20 | **16** | 80% | 3 |
| Agência de Marketing | 20 | 20 | 20 | **15** | 75% | 15 |
| Arquiteto | 20 | 20 | 20 | **12** | 60% | 18 |
| Advogado | 20 | 16 | 16 | **9** | 56% | 17 |
| Contador / Contabilidade | 20 | 18 | 18 | **7** | 39% | 12 |
| Dentista / Odontologia | 20 | 16 | 16 | **5** | 31% | 16 |
| **Restaurante** (baseline, Pindamonhangaba) | 20 | ~9 (quase todos Instagram/Facebook) | 9 | **0** | 0% | 10 |

> O Google Places retornou `email = 0` em **todos** os setores na fase de coleta — confirma que o provider não é fonte de e-mail. Os números da coluna "E-mails encontrados" vêm inteiramente do crawler de sites.

## Qualidade dos e-mails (composição do domínio)

Volume bruto engana: e-mail de domínio externo costuma ser de uma agência, portal imobiliário ou plataforma de terceiros — não do lead em si. Descontando os externos, o e-mail "do próprio negócio" fica:

| Setor | Encontrados | Canônico | Pessoal | Externo | Do próprio domínio (canônico+pessoal) |
|---|---:|---:|---:|---:|---:|
| Imobiliária | 16 | 12 | 2 | 2 | **14** |
| Agência de Marketing | 15 | 10 | 1 | 4 | **11** |
| Arquiteto | 12 | 6 | 0 | 6 | **6** |
| Contador | 7 | 4 | 1 | 2 | **5** |
| Advogado | 9 | 3 | 1 | 5 | **4** |
| Dentista | 5 | 0 | 1 | 4 | **1** |

Releitura por qualidade:
- **Imobiliária e Agência de Marketing** lideram em volume **e** em e-mail do próprio domínio — são os alvos mais eficientes para outbound por e-mail.
- **Arquiteto e Advogado** têm bastante volume bruto, mas metade ou mais é domínio externo (portais, plataformas, agências). Exigem filtro de domínio canônico antes do envio.
- **Dentista** rende pouco e quase tudo externo — e-mail é canal fraco aqui, apesar de ter sites.
- Exemplo real capturado (imobiliária): `falecom@topimoveissjc.com.br [canonical]`, integridade 100.

## Comparação com o baseline de restaurantes

| | Restaurante (Pinda) | Média dos 6 profissionais (SJC) |
|---|---:|---:|
| Com site próprio | ~0% (quase todos perfis sociais) | ~88% |
| E-mails por 20 leads | 0 | ~10,7 |
| Canal viável | WhatsApp / telefone | E-mail **e** WhatsApp |

O contraste confirma a tese do documento `06-11-aumentar-emails-lead-hunting`: o déficit de e-mail no nicho de restaurantes não é falha do pipeline, é característica do mercado (negócio local sem site). Onde há site próprio, o mesmo pipeline rende e-mail de verdade.

## Recomendações

1. **Para outbound por e-mail, priorizar Imobiliária e Agência de Marketing** (maior volume e maior fração de domínio canônico).
2. **Arquiteto e Advogado** valem a pena, mas com a regra de domínio canônico ligada para barrar e-mails de portais/agências (o pipeline já classifica `external` — basta não promover externo a primário, como o worker já faz).
3. **Dentista, Restaurante e similares de baixa maturidade digital:** tratar como canal WhatsApp/telefone primeiro; e-mail é exceção, não regra.
4. **O crawler é a fonte de e-mail, não o Google Places.** Qualquer expectativa de "mais e-mails" passa por rodar o `email-discovery-worker` (com `--apply`) nos setores certos — nesta amostra ele passaria o gate T-03 (found/scanned ≥ 8%) com folga em todos os 6 setores profissionais (31%–80%).

## Notas técnicas

- Os números são de execução **dry-run** (nenhum e-mail foi gravado nos leads). Para persistir, rodar `pnpm tsx scripts/run-email-discovery.ts --apply --niche "<setor>"`.
- Durante este teste foi corrigido um bug real do crawler: o `safe-fetch-html` rejeitava hosts dual-stack (IPv4+IPv6), o que bloqueava a maioria dos sites brasileiros. Sem esse fix, todos os números acima seriam próximos de zero. Correção: pinar o primeiro IPv4 público na conexão.
- A coleta exige a credencial do Google Places **gravada no banco** (`api_credentials`), não apenas no `.env` — rodar `scripts/seed-google-places-credential.ts` antes da primeira coleta.
- Amostra de 20 por setor: suficiente para ranquear, não para precisão estatística fina. Para decisão de produto, repetir com 100+ por setor e em mais de uma cidade.
