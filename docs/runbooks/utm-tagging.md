# Runbook — UTM Tagging Convention

| Campo | Valor |
|-------|-------|
| Versao | 1.0 |
| Origem | M14 — G-018 |

## Objetivo

Padronizar parametros UTM em TODOS os links externos para a landing page, viabilizando atribuicao precisa em GA4/Plausible.

---

## Estrutura Canonica

```
?utm_source={canal}
&utm_medium={tipo_de_trafego}
&utm_campaign={campanha}
&utm_content={peca_especifica}
[&utm_term={keyword}]
```

---

## utm_source (canal de origem)

| Valor | Quando usar |
|-------|-------------|
| `linkedin` | Posts/artigos no LinkedIn |
| `instagram` | Posts no Instagram (link na bio + linktree) |
| `email` | Emails transacionais ou marketing |
| `portfolio` | Estudos de caso publicados |
| `referral` | Indicacao boca-a-boca rastreavel |
| `direct` | Trafego direto (NAO usar UTM — deixar GA4 inferir) |

---

## utm_medium (tipo de trafego)

| Valor | Quando usar |
|-------|-------------|
| `organic-social` | Posts organicos em redes sociais |
| `paid-social` | Anuncios pagos em redes sociais (futuro) |
| `email` | Email marketing |
| `referral` | Backlinks de outros sites |
| `cpc` | Anuncios pagos (Google Ads, futuro) |

---

## utm_campaign (campanha logica)

| Valor | Periodo | Descricao |
|-------|---------|-----------|
| `m14-content-launch` | Q2 2026 | Conteudo do lancamento M14 |
| `m14-pilot-program` | Q2 2026 | Comunicacao do programa piloto |
| `m15-scale-launch` | Q3 2026 | (futuro) Escala pos-piloto |

---

## utm_content (peca especifica)

| Padrao | Exemplo |
|--------|---------|
| LinkedIn artigo | `post-NN` (ex: `post-01`) |
| Instagram | `ig-NN` (ex: `ig-15`) |
| Email | `email-{slug}` (ex: `email-pilot-invite`) |
| Estudo de caso | `case-{slug}` (ex: `case-distribuidora-sp`) |

---

## utm_term (opcional — keywords)

Usar apenas em CPC (anuncios pagos). Em organico, deixar vazio.

---

## Exemplos Completos

LinkedIn artigo 3:
```
https://leadhunting.example.com/?utm_source=linkedin&utm_medium=organic-social&utm_campaign=m14-content-launch&utm_content=post-03
```

Instagram post 12:
```
https://leadhunting.example.com/?utm_source=instagram&utm_medium=organic-social&utm_campaign=m14-content-launch&utm_content=ig-12
```

Email convite piloto:
```
https://leadhunting.example.com/invite/abc123?utm_source=email&utm_medium=email&utm_campaign=m14-pilot-program&utm_content=email-pilot-invite
```

---

## Encurtador

Usar bit.ly ou similar APENAS quando o URL completo prejudicar o copy. Sempre que possivel, manter UTM cru — facilita debug.

Se usar encurtador, registrar mapping em:
`output/docs/lead-hunting-engine/marketing/utm-shortlinks.json`

---

## Validacao

Antes de publicar, sempre testar:
1. Abrir o link no browser
2. Verificar que GA4 / Plausible registra o trafego com a atribuicao correta
3. Confirmar que `utm_*` aparece no dashboard de analytics

---

## Anti-padroes

- NAO usar espacos ou acentos nos valores UTM
- NAO usar maiuscula (sempre kebab-case lowercase)
- NAO duplicar utm_source com utm_medium (`source=facebook`, `medium=facebook` errado)
- NAO esquecer utm_content (sem ele nao e possivel atribuir peca especifica)
