/**
 * scripts/measure-contact-baseline.ts
 *
 * MEDICAO DE BASELINE de contatabilidade (feature aumentar e-mails/WhatsApp,
 * blacksmith 06-11 — criterio de aceite 1 e §15 passo 1). Valida as Hipoteses
 * 0 e 1 (§7) contra os limiares nomeados T-01 e T-02 (§11.1) e reporta T-10
 * como medicao informativa (celulares BR na base, sem gate).
 *
 * READ-ONLY por design: o script faz APENAS leituras (count/findMany/groupBy/
 * $queryRaw SELECT). Nenhum write no banco, sem flag --apply.
 *
 * O que mede:
 *   1. populacao de leads: total, com email, com website, com website e SEM
 *      email (elegivel para crawling — gate T-02 >= 15%);
 *   2. cobertura de HTML capturado: RawLeadData cujo raw_json tem chave
 *      top-level 'siteHtml' ou 'html' (operador jsonb ?|) e quantos desses
 *      estao ligados a leads sem e-mail (gate T-01 >= 10% da base);
 *   3. leads com phoneNormalized e classificacao celular/fixo/unknown via
 *      classifyBRPhone (T-10 informativo);
 *   4. isWhatsappChannel: true / false / null;
 *   5. candidatos a descarte pela definicao do §4.8 (emenda R3-2 do review
 *      06-11: phone cru tambem precisa ser nulo): status NEW sem nenhum canal
 *      (email, phone, phoneNormalized, website, instagramHandle, facebookUrl
 *      nulos E isWhatsappChannel distinto de true);
 *   6. quebras por niche e por userId das contagens 1 e 5.
 *
 * Modo adicional --quickwin-compare (criterio de aceite 4 do doc): compara
 * ANTES/DEPOIS do quick win de descoberta de e-mail sobre RawLeadData com
 * HTML capturado e lead vinculado. ANTES = discoverEmails({ rawJson })
 * (comportamento pre-quick-win, so o JSON do provider); DEPOIS = idem + html
 * do site (rawJson.siteHtml || rawJson.html) + websiteUrl do lead. Reporta o
 * ganho de found e a quebra do DEPOIS por generico/pessoal e por classe de
 * dominio (canonical/external/unknown). Tao read-only quanto o baseline:
 * apenas SELECT, zero writes.
 *
 * Uso:
 *   pnpm tsx scripts/measure-contact-baseline.ts [--json] [--user <id>] [--niche <n>]
 *   pnpm tsx scripts/measure-contact-baseline.ts --quickwin-compare [--limit N] [--json] [--user <id>] [--niche <n>]
 *
 * --json imprime, alem da tabela legivel, um bloco JSON ao final (delimitado
 * por '--- JSON ---') para consumo por maquina.
 */
import 'dotenv/config'
import { Prisma, type PrismaClient } from '@prisma/client'
import { createSeedClient } from '../prisma/seed/client'
import { classifyBRPhone } from '../src/lib/intelligence/enrichment/enrichers/phone-classifier'
import { discoverEmails } from '../src/lib/intelligence/enrichment/enrichers/email-discovery'
import { isGenericEmail } from '../src/lib/intelligence/enrichment/enrichers/email-prioritizer'

const args = process.argv.slice(2)
const JSON_OUT = args.includes('--json')
const USER = args.includes('--user') ? args[args.indexOf('--user') + 1] : undefined
const NICHE = args.includes('--niche') ? args[args.indexOf('--niche') + 1] : undefined
const QUICKWIN_COMPARE = args.includes('--quickwin-compare')
// --limit so vale no modo --quickwin-compare (amostra de RawLeadData; default 200).
const QUICKWIN_LIMIT = (() => {
  const idx = args.indexOf('--limit')
  if (idx === -1) return 200
  const n = Number(args[idx + 1])
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 200
})()

// Limiares nomeados de §11.1 (defaults provisorios do doc da feature).
const T01_HTML_COVERAGE = 0.10
const T02_ELIGIBLE_POPULATION = 0.15

type Verdict = 'PASSA' | 'NAO PASSA' | 'SEM DADOS'

/** Percentual legivel com 1 casa; 'n/a' quando o denominador e zero. */
function pct(num: number, den: number): string {
  if (den === 0) return 'n/a'
  return `${((num / den) * 100).toFixed(1)}%`
}

/** Veredito de gate: razao num/den comparada ao limiar; sem base = SEM DADOS. */
function verdict(num: number, den: number, threshold: number): Verdict {
  if (den === 0) return 'SEM DADOS'
  return num / den >= threshold ? 'PASSA' : 'NAO PASSA'
}

interface HtmlCoverageRow {
  raw_rows: bigint
  leads_com_html: bigint
  leads_com_html_sem_email: bigint
}

interface BreakdownRow {
  total: number
  comEmail: number
  comWebsite: number
  elegiveis: number
  descarte: number
}

/**
 * groupBy tipado por dimensao. Chave null vira rotulo legivel para nao
 * sumir da tabela (niche e nulavel; userId nunca e null no schema).
 */
async function groupCounts(
  prisma: PrismaClient,
  field: 'niche' | 'userId',
  where: Prisma.LeadWhereInput,
): Promise<Map<string, number>> {
  if (field === 'niche') {
    const rows = await prisma.lead.groupBy({ by: ['niche'], where, _count: { _all: true } })
    return new Map(rows.map((r) => [r.niche ?? '(sem nicho)', r._count._all]))
  }
  const rows = await prisma.lead.groupBy({ by: ['userId'], where, _count: { _all: true } })
  return new Map(rows.map((r) => [r.userId, r._count._all]))
}

async function buildBreakdown(
  prisma: PrismaClient,
  field: 'niche' | 'userId',
  leadWhere: Prisma.LeadWhereInput,
  descarteWhere: Prisma.LeadWhereInput,
): Promise<Record<string, BreakdownRow>> {
  const [total, comEmail, comWebsite, elegiveis, descarte] = await Promise.all([
    groupCounts(prisma, field, leadWhere),
    groupCounts(prisma, field, { ...leadWhere, email: { not: null } }),
    groupCounts(prisma, field, { ...leadWhere, website: { not: null } }),
    groupCounts(prisma, field, { ...leadWhere, website: { not: null }, email: null }),
    groupCounts(prisma, field, descarteWhere),
  ])
  const out: Record<string, BreakdownRow> = {}
  // 'total' cobre todo lead do filtro, logo e superset das demais dimensoes.
  for (const [key, value] of total) {
    out[key] = {
      total: value,
      comEmail: comEmail.get(key) ?? 0,
      comWebsite: comWebsite.get(key) ?? 0,
      elegiveis: elegiveis.get(key) ?? 0,
      descarte: descarte.get(key) ?? 0,
    }
  }
  return out
}

function printBreakdownTable(title: string, rows: Record<string, BreakdownRow>): void {
  console.log(`\n[6] Quebra por ${title}`)
  const keys = Object.keys(rows)
  if (keys.length === 0) {
    console.log('  (sem leads no filtro)')
    return
  }
  const labelWidth = Math.max(title.length, ...keys.map((k) => k.length))
  const header = `  ${title.padEnd(labelWidth)} | ${'total'.padStart(7)} | ${'email'.padStart(7)} | ${'website'.padStart(7)} | ${'site s/ email'.padStart(13)} | ${'descarte'.padStart(8)}`
  console.log(header)
  console.log(`  ${'-'.repeat(header.length - 2)}`)
  for (const key of keys.sort((a, b) => rows[b].total - rows[a].total)) {
    const r = rows[key]
    console.log(
      `  ${key.padEnd(labelWidth)} | ${String(r.total).padStart(7)} | ${String(r.comEmail).padStart(7)} | ${String(r.comWebsite).padStart(7)} | ${String(r.elegiveis).padStart(13)} | ${String(r.descarte).padStart(8)}`,
    )
  }
}

interface QuickwinSampleRow {
  raw_json: unknown
  website: string | null
}

/**
 * Modo --quickwin-compare (criterio 4 do doc): roda discoverEmails duas vezes
 * por amostra — ANTES (so rawJson, comportamento pre-quick-win) e DEPOIS
 * (rawJson + html capturado + websiteUrl do lead vinculado) — e reporta o
 * ganho. READ-ONLY: um unico SELECT; a classificacao toda e em memoria com
 * funcoes puras (discoverEmails/isGenericEmail).
 */
async function runQuickwinCompare(prisma: PrismaClient): Promise<void> {
  // Mesma deteccao jsonb do baseline (chaves top-level 'siteHtml'/'html'),
  // porem com JOIN obrigatorio no lead: o DEPOIS precisa do website canonico.
  const userCond = USER ? Prisma.sql`AND r.user_id = ${USER}::uuid` : Prisma.empty
  const nicheCond = NICHE ? Prisma.sql`AND l.niche = ${NICHE}` : Prisma.empty
  const rows = await prisma.$queryRaw<QuickwinSampleRow[]>`
    SELECT r.raw_json AS raw_json, l.website AS website
    FROM raw_lead_data r
    JOIN leads l ON l.id = r.lead_id
    WHERE r.raw_json ?| ARRAY['siteHtml', 'html']
      ${userCond}
      ${nicheCond}
    ORDER BY r.collected_at DESC
    LIMIT ${QUICKWIN_LIMIT}
  `

  let foundAntes = 0
  let foundDepois = 0
  // Quebra do DEPOIS em dois eixos independentes sobre o primary encontrado:
  // generico/pessoal (isGenericEmail) e classe de dominio (primaryDomainClass).
  const depois = { generico: 0, pessoal: 0, canonical: 0, external: 0, unknown: 0 }

  for (const row of rows) {
    const rawJson =
      row.raw_json && typeof row.raw_json === 'object' && !Array.isArray(row.raw_json)
        ? (row.raw_json as Record<string, unknown>)
        : null
    // Mesmo contrato do quick win em producao: siteHtml tem precedencia.
    const html =
      typeof rawJson?.siteHtml === 'string'
        ? rawJson.siteHtml
        : typeof rawJson?.html === 'string'
          ? rawJson.html
          : null

    const antes = discoverEmails({ rawJson })
    const resultado = discoverEmails({ rawJson, html, websiteUrl: row.website })

    if (antes.primary) foundAntes++
    if (resultado.primary) {
      foundDepois++
      if (isGenericEmail(resultado.primary)) depois.generico++
      else depois.pessoal++
      depois[resultado.primaryDomainClass]++
    }
  }

  const total = rows.length
  const ganho = foundDepois - foundAntes

  console.log('== Comparacao quick win de descoberta de e-mail (criterio 4) ==')
  console.log(`Filtros: user=${USER ?? '(todos)'} niche=${NICHE ?? '(todos)'} limit=${QUICKWIN_LIMIT}`)
  console.log('ANTES = discoverEmails({ rawJson }) | DEPOIS = + html capturado + websiteUrl do lead')

  console.log('\n[1] Amostra (RawLeadData com siteHtml/html e lead vinculado)')
  console.log(`  amostras comparadas ........................ ${total}`)

  console.log('\n[2] Found (primary != null)')
  console.log(`  ANTES ...................................... ${foundAntes} (${pct(foundAntes, total)})`)
  console.log(`  DEPOIS ..................................... ${foundDepois} (${pct(foundDepois, total)})`)
  console.log(`  ganho (DEPOIS - ANTES) ..................... ${ganho >= 0 ? '+' : ''}${ganho}`)

  console.log('\n[3] Quebra do DEPOIS — generico vs pessoal')
  console.log(`  generico ................................... ${depois.generico} (${pct(depois.generico, foundDepois)})`)
  console.log(`  pessoal .................................... ${depois.pessoal} (${pct(depois.pessoal, foundDepois)})`)

  console.log('\n[4] Quebra do DEPOIS — classe de dominio vs website do lead')
  console.log(`  dominio canonico ........................... ${depois.canonical} (${pct(depois.canonical, foundDepois)})`)
  console.log(`  dominio externo ............................ ${depois.external} (${pct(depois.external, foundDepois)})`)
  console.log(`  unknown (sem website utilizavel) ........... ${depois.unknown} (${pct(depois.unknown, foundDepois)})`)

  if (JSON_OUT) {
    const report = {
      measuredAt: new Date().toISOString(),
      mode: 'quickwin-compare',
      filters: { userId: USER ?? null, niche: NICHE ?? null, limit: QUICKWIN_LIMIT },
      compared: total,
      found: { before: foundAntes, after: foundDepois, gain: ganho },
      afterBreakdown: {
        generic: depois.generico,
        personal: depois.pessoal,
        canonicalDomain: depois.canonical,
        externalDomain: depois.external,
        unknownDomain: depois.unknown,
      },
    }
    console.log('\n--- JSON ---')
    console.log(JSON.stringify(report, null, 2))
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(
      '[baseline] DATABASE_URL ausente. Preencha o .env (ou exporte a variavel) com a connection string do Postgres antes de rodar a medicao.',
    )
    process.exitCode = 1
    return
  }
  if (USER && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(USER)) {
    console.error(`[baseline] --user deve ser um UUID valido (recebido: "${USER}").`)
    process.exitCode = 1
    return
  }

  const prisma = createSeedClient()
  try {
    if (QUICKWIN_COMPARE) {
      await runQuickwinCompare(prisma)
      return
    }

    const leadWhere: Prisma.LeadWhereInput = {
      ...(USER ? { userId: USER } : {}),
      ...(NICHE ? { niche: NICHE } : {}),
    }
    // Definicao operacional de "sem contato" do §4.8 (default do doc):
    // status NEW e todos os canais nulos. isWhatsappChannel e Boolean nulavel,
    // entao "distinto de true" exige OR explicito [null, false] — `not: true`
    // no Prisma exclui NULL pela semantica SQL e subcontaria os candidatos.
    // Review 06-11 R3-2 (emenda §4.8): phone E phoneNormalized nulos — lead
    // legado com phone preenchido e phoneNormalized null tem canal real e nao
    // pode contar como candidato a descarte (mesma definicao do
    // contactability-job, mantida em paridade).
    const descarteWhere: Prisma.LeadWhereInput = {
      ...leadWhere,
      status: 'NEW',
      email: null,
      phone: null,
      phoneNormalized: null,
      website: null,
      instagramHandle: null,
      facebookUrl: null,
      OR: [{ isWhatsappChannel: null }, { isWhatsappChannel: false }],
    }

    // ---- 1. Populacao de leads -------------------------------------------
    const [totalLeads, comEmail, comWebsite, elegiveis] = await Promise.all([
      prisma.lead.count({ where: leadWhere }),
      prisma.lead.count({ where: { ...leadWhere, email: { not: null } } }),
      prisma.lead.count({ where: { ...leadWhere, website: { not: null } } }),
      prisma.lead.count({ where: { ...leadWhere, website: { not: null }, email: null } }),
    ])

    // ---- 2. Cobertura de HTML capturado (jsonb ?| em raw_json) -----------
    // Operador ?| testa chaves TOP-LEVEL — exatamente o contrato do quick win
    // (rawJson.siteHtml / rawJson.html). LEFT JOIN preserva linhas RawLeadData
    // sem lead vinculado; com --niche o filtro exige lead vinculado do nicho.
    const userCond = USER ? Prisma.sql`AND r.user_id = ${USER}::uuid` : Prisma.empty
    const nicheCond = NICHE ? Prisma.sql`AND l.niche = ${NICHE}` : Prisma.empty
    const htmlRows = await prisma.$queryRaw<HtmlCoverageRow[]>`
      SELECT
        COUNT(*)::bigint AS raw_rows,
        COUNT(DISTINCT r.lead_id)::bigint AS leads_com_html,
        COUNT(DISTINCT r.lead_id) FILTER (WHERE l.id IS NOT NULL AND l.email IS NULL)::bigint AS leads_com_html_sem_email
      FROM raw_lead_data r
      LEFT JOIN leads l ON l.id = r.lead_id
      WHERE r.raw_json ?| ARRAY['siteHtml', 'html']
        ${userCond}
        ${nicheCond}
    `
    const rawRowsComHtml = Number(htmlRows[0]?.raw_rows ?? 0n)
    const leadsComHtml = Number(htmlRows[0]?.leads_com_html ?? 0n)
    const leadsComHtmlSemEmail = Number(htmlRows[0]?.leads_com_html_sem_email ?? 0n)

    // ---- 3. Telefones + classificacao BR (T-10 informativo) --------------
    // Busca somente a coluna phoneNormalized e classifica em JS: classifyBRPhone
    // e funcao pura e a base de baseline e modesta — sem necessidade de cursor.
    const phones = await prisma.lead.findMany({
      where: { ...leadWhere, phoneNormalized: { not: null } },
      select: { phoneNormalized: true },
    })
    const phoneClasses = { mobile: 0, fixed: 0, unknown: 0 }
    for (const p of phones) phoneClasses[classifyBRPhone(p.phoneNormalized)]++
    const comPhone = phones.length

    // ---- 4. isWhatsappChannel --------------------------------------------
    const [waTrue, waFalse, waNull] = await Promise.all([
      prisma.lead.count({ where: { ...leadWhere, isWhatsappChannel: true } }),
      prisma.lead.count({ where: { ...leadWhere, isWhatsappChannel: false } }),
      prisma.lead.count({ where: { ...leadWhere, isWhatsappChannel: null } }),
    ])

    // ---- 5. Candidatos a descarte (§4.8) ---------------------------------
    const candidatosDescarte = await prisma.lead.count({ where: descarteWhere })

    // ---- 6. Quebras por niche e por userId -------------------------------
    const porNiche = await buildBreakdown(prisma, 'niche', leadWhere, descarteWhere)
    const porUserId = await buildBreakdown(prisma, 'userId', leadWhere, descarteWhere)

    // ---- Vereditos dos limiares ------------------------------------------
    const t01 = verdict(leadsComHtml, totalLeads, T01_HTML_COVERAGE)
    const t02 = verdict(elegiveis, totalLeads, T02_ELIGIBLE_POPULATION)

    // ---- Relatorio legivel -------------------------------------------------
    console.log('== Baseline de contatabilidade (lead-hunting-engine) ==')
    console.log(`Filtros: user=${USER ?? '(todos)'} niche=${NICHE ?? '(todos)'}`)

    console.log('\n[1] Populacao de leads')
    console.log(`  total de leads ............................. ${totalLeads}`)
    console.log(`  com email .................................. ${comEmail} (${pct(comEmail, totalLeads)})`)
    console.log(`  com website ................................ ${comWebsite} (${pct(comWebsite, totalLeads)})`)
    console.log(`  com website e SEM email (elegivel crawling)  ${elegiveis} (${pct(elegiveis, totalLeads)}) -> gate T-02 (>= 15%): ${t02}`)

    console.log("\n[2] Cobertura de HTML capturado (raw_json com 'siteHtml' ou 'html')")
    console.log(`  linhas RawLeadData com HTML ................ ${rawRowsComHtml}`)
    console.log(`  leads distintos com HTML ................... ${leadsComHtml} (${pct(leadsComHtml, totalLeads)} da base) -> gate T-01 (>= 10%): ${t01}`)
    console.log(`  desses, ligados a leads SEM email .......... ${leadsComHtmlSemEmail}`)

    console.log('\n[3] Telefones (T-10 informativo, sem gate)')
    console.log(`  leads com phoneNormalized .................. ${comPhone} (${pct(comPhone, totalLeads)})`)
    console.log(`  celular BR (mobile) ........................ ${phoneClasses.mobile} (${pct(phoneClasses.mobile, comPhone)} dos telefones)`)
    console.log(`  fixo BR (fixed) ............................ ${phoneClasses.fixed} (${pct(phoneClasses.fixed, comPhone)} dos telefones)`)
    console.log(`  unknown .................................... ${phoneClasses.unknown} (${pct(phoneClasses.unknown, comPhone)} dos telefones)`)

    console.log('\n[4] isWhatsappChannel')
    console.log(`  true ....................................... ${waTrue}`)
    console.log(`  false ...................................... ${waFalse}`)
    console.log(`  null ....................................... ${waNull}`)

    console.log('\n[5] Candidatos a descarte (§4.8: NEW sem nenhum canal)')
    console.log(`  candidatos ................................. ${candidatosDescarte} (${pct(candidatosDescarte, totalLeads)} da base)`)

    printBreakdownTable('niche', porNiche)
    printBreakdownTable('userId', porUserId)

    console.log('\n== Resumo dos limiares (§11.1) ==')
    console.log(`  T-01 cobertura de HTML capturado: ${pct(leadsComHtml, totalLeads)} (gate >= 10%) -> ${t01}`)
    console.log(`  T-02 populacao elegivel para crawling: ${pct(elegiveis, totalLeads)} (gate >= 15%) -> ${t02}`)
    console.log(`  T-10 celulares BR entre telefones: ${pct(phoneClasses.mobile, comPhone)} (informativo, sem gate)`)

    // ---- Bloco JSON (--json) ----------------------------------------------
    if (JSON_OUT) {
      const report = {
        measuredAt: new Date().toISOString(),
        filters: { userId: USER ?? null, niche: NICHE ?? null },
        leads: {
          total: totalLeads,
          withEmail: comEmail,
          withWebsite: comWebsite,
          withWebsiteWithoutEmail: elegiveis,
        },
        htmlCoverage: {
          rawRowsWithHtml: rawRowsComHtml,
          distinctLeadsWithHtml: leadsComHtml,
          distinctLeadsWithHtmlWithoutEmail: leadsComHtmlSemEmail,
        },
        phones: {
          withPhoneNormalized: comPhone,
          mobile: phoneClasses.mobile,
          fixed: phoneClasses.fixed,
          unknown: phoneClasses.unknown,
        },
        whatsappChannel: { true: waTrue, false: waFalse, null: waNull },
        discardCandidates: candidatosDescarte,
        breakdownByNiche: porNiche,
        breakdownByUserId: porUserId,
        thresholds: {
          't-01': {
            gate: '>= 10% da base com rawJson.siteHtml/html',
            ratio: totalLeads ? leadsComHtml / totalLeads : null,
            verdict: t01,
          },
          't-02': {
            gate: '>= 15% da base com website != null AND email == null',
            ratio: totalLeads ? elegiveis / totalLeads : null,
            verdict: t02,
          },
          't-10': {
            gate: 'informativo, sem gate (celulares BR entre telefones)',
            ratio: comPhone ? phoneClasses.mobile / comPhone : null,
            verdict: 'SEM GATE',
          },
        },
      }
      console.log('\n--- JSON ---')
      console.log(JSON.stringify(report, null, 2))
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  // Mensagem limpa, sem stack trace cru (DB inacessivel cai aqui).
  console.error('[baseline] erro:', e instanceof Error ? e.message : e)
  process.exitCode = 1
})
