/**
 * Job de contatabilidade — descarte reversivel de leads sem canal de contato.
 * Feature: aumentar descoberta de e-mails e WhatsApp (blacksmith 06-11,
 * criterios 22-26 + secao 16 Task 7; limiares T-08/T-09 de §11.1).
 *
 * Regras centrais (§4.8 do doc):
 *  - avalia EXCLUSIVAMENTE leads em status NEW, com a definicao de "sem
 *    contato" como filtro HARD no proprio where (criterio 24), nunca em
 *    pos-processamento;
 *  - DEC-MARCADOR-DESCOBERTA (default do doc): sem `contactDiscovery.completedAt`
 *    valido em enrichmentData o lead NAO e elegivel para descarte, mesmo sem
 *    canal algum (fail-closed, criterio 26);
 *  - sinal de WhatsApp 'confirmed' OU 'probable' SEGURA o lead no funil — so
 *    'unknown'/ausente conta como sem canal;
 *  - transicao SEMPRE via leadService.updateStatus (state machine de
 *    transitions.ts + historico + side-effects canonicos), nunca
 *    prisma.lead.update direto de status; estado alvo e DISQUALIFIED
 *    (reversivel via DISQUALIFIED -> NEW), nunca DISCARDED/FALSE_POSITIVE;
 *  - DEC-RETENCAO-DESCARTE segue ABERTA no doc: o apply exige
 *    `retentionDecision` explicita. 'purge-15d' mantem o side-effect padrao da
 *    state machine (retentionUntil = +15d, purge fisico pelo
 *    retention-cleanup); 'keep' zera retentionUntil apos a transicao e
 *    registra a politica em LeadHistory (`retention_policy`). Review R2-4: o
 *    zeramento tem retry com backoff curto — se falhar de vez, o lead que o
 *    operador quis MANTER ficaria sujeito a purge fisico em 15 dias, entao o
 *    report acumula `retentionOverrideFailures`/`retentionOverrideFailedIds`
 *    para correcao manual DENTRO da janela;
 *  - criterio 23: alem da quebra por nicho, o report quebra os noContact por
 *    fonte (source da primeira RawLeadData vinculada; 'sem-fonte' sem raw);
 *  - dry-run e o default; falha de transicao em um lead (race com operador:
 *    status mudou entre query e update, lead deletado) loga e continua o lote
 *    — nunca aborta tudo, nunca forca a transicao.
 *
 * Idempotencia: o filtro `status: NEW` garante que uma segunda execucao
 * consecutiva nao reavalia leads ja desqualificados (disqualified = 0).
 */

import { Prisma, type PrismaClient } from '@prisma/client'
import { leadService } from '@/services/lead.service'
import {
  readContactDiscovery,
  readWhatsappEnrichment,
} from '@/lib/intelligence/enrichment/enrichment-data'

/**
 * Tratamento de retencao do descarte automatico (DEC-RETENCAO-DESCARTE):
 *  - 'purge-15d': mantem o purge fisico padrao de 15 dias do DISQUALIFIED;
 *  - 'keep': retencao diferenciada — lead desqualificado por
 *    no_contact_channel NAO entra na janela de purge (retentionUntil null).
 */
export type RetentionDecision = 'purge-15d' | 'keep'

export interface ContactabilityJobOptions {
  prisma: PrismaClient
  /** Default false — dry-run nao transiciona nada. */
  apply?: boolean
  /** Tamanho maximo do lote (default 100). */
  limit?: number
  /** Filtro opcional por dono do lead. */
  userId?: string
  /** Filtro opcional por nicho. */
  niche?: string
  /** Obrigatoria quando apply=true (DEC-RETENCAO-DESCARTE segue aberta). */
  retentionDecision?: RetentionDecision
}

/** Candidato a descarte (lista para amostragem manual do gate T-09). */
export interface ContactabilityCandidate {
  id: string
  businessName: string
  niche: string | null
}

export interface ContactabilityReport {
  /** Leads retornados pela query (status NEW + sem canal por filtro hard). */
  evaluated: number
  /** Leads sem nenhum canal apos descoberta concluida (candidatos reais). */
  noContact: number
  /** Transicoes NEW -> DISQUALIFIED efetivadas (0 em dry-run). */
  disqualified: number
  /** Pulados por falta do marcador contactDiscovery (fail-closed). */
  skippedNoMarker: number
  /** Pulados por sinal WhatsApp 'confirmed'/'probable' (seguram o funil). */
  skippedHasChannel: number
  /** Transicoes que falharam por race (status mudou/lead sumiu) — lote segue. */
  skippedRace: number
  /** Quebra dos noContact por nicho ('sem-nicho' quando nulo). */
  byNiche: Record<string, number>
  /**
   * Quebra dos noContact por fonte de coleta (criterio 23): source da primeira
   * RawLeadData vinculada; 'sem-fonte' quando o lead nao tem raw vinculada.
   */
  bySource: Record<string, number>
  /**
   * R2-4: leads desqualificados com decisao 'keep' cujo zeramento de
   * retentionUntil falhou apos os retries — seguem na janela de purge fisico
   * de 15 dias e exigem correcao manual DENTRO da janela.
   */
  retentionOverrideFailures: number
  /** Ids dos leads de retentionOverrideFailures (para correcao manual). */
  retentionOverrideFailedIds: string[]
  dryRun: boolean
  retentionDecision: RetentionDecision | null
  /** Lista dos noContact (id, businessName, niche) para amostragem T-09. */
  candidates: ContactabilityCandidate[]
}

/** Razao canonica registrada em LeadHistory (field `disqualify_reason`). */
export const NO_CONTACT_REASON = 'no_contact_channel'
/** Valor registrado em LeadHistory (field `retention_policy`) na decisao 'keep'. */
export const RETENTION_KEEP_VALUE = 'no_contact_channel_keep'

const NICHE_FALLBACK_KEY = 'sem-nicho'
const SOURCE_FALLBACK_KEY = 'sem-fonte'

/**
 * R2-4: tentativas e backoff do zeramento de retentionUntil na decisao 'keep'.
 * Backoff curto de proposito — o job e batch/CLI e a falha definitiva ja tem
 * caminho de correcao manual via report.
 */
const RETENTION_OVERRIDE_MAX_ATTEMPTS = 3
const RETENTION_OVERRIDE_BACKOFF_MS = [50, 150]

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Zera retentionUntil com retry (R2-4). A transicao via updateStatus ja setou
 * retentionUntil = +15d (side-effect canonico); se este write falhar de vez, o
 * lead que o operador decidiu MANTER segue elegivel a purge FISICO pelo
 * retention-cleanup. Retorna true em sucesso; em falha definitiva loga ALTO
 * com o leadId e devolve false (o caller acumula no report — a transicao NAO e
 * desfeita e o lote continua).
 */
async function clearRetentionWithRetry(prisma: PrismaClient, leadId: string): Promise<boolean> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= RETENTION_OVERRIDE_MAX_ATTEMPTS; attempt++) {
    try {
      await prisma.lead.update({
        where: { id: leadId },
        data: { retentionUntil: null },
      })
      return true
    } catch (err) {
      lastErr = err
      if (attempt < RETENTION_OVERRIDE_MAX_ATTEMPTS) {
        await sleep(RETENTION_OVERRIDE_BACKOFF_MS[attempt - 1] ?? 150)
      }
    }
  }
  console.error(
    `[contactability] ALERTA CRITICO R2-4: lead ${leadId} desqualificado com decisao 'keep' ` +
      `mas o zeramento de retentionUntil FALHOU apos ${RETENTION_OVERRIDE_MAX_ATTEMPTS} tentativas. ` +
      'O lead segue com retentionUntil = +15d e sera PURGADO FISICAMENTE pelo retention-cleanup ' +
      'se nao houver correcao manual (retentionUntil = null) DENTRO da janela de 15 dias. Erro:',
    lastErr instanceof Error ? lastErr.message : lastErr,
  )
  return false
}

export async function runContactabilityJob(
  opts: ContactabilityJobOptions,
): Promise<ContactabilityReport> {
  const { prisma, apply = false, limit = 100, userId, niche, retentionDecision } = opts

  // DEC-RETENCAO-DESCARTE (blacksmith 06-11 §4.8 item 3) esta ABERTA: o purge
  // fisico de 15 dias do DISQUALIFIED nao pode virar efeito colateral nao
  // declarado. Apply sem decisao explicita e erro, nao default silencioso.
  if (apply && retentionDecision !== 'purge-15d' && retentionDecision !== 'keep') {
    throw new Error(
      'runContactabilityJob: apply=true exige retentionDecision explicita ' +
        "('purge-15d' | 'keep'). A decisao DEC-RETENCAO-DESCARTE do doc da " +
        'feature (blacksmith/brainstorm-mcp/06-11-aumentar-emails-lead-hunting.md) ' +
        'segue aberta — sem ela o job roda apenas em dry-run.',
    )
  }

  const report: ContactabilityReport = {
    evaluated: 0,
    noContact: 0,
    disqualified: 0,
    skippedNoMarker: 0,
    skippedHasChannel: 0,
    skippedRace: 0,
    byNiche: {},
    bySource: {},
    retentionOverrideFailures: 0,
    retentionOverrideFailedIds: [],
    dryRun: !apply,
    retentionDecision: retentionDecision ?? null,
    candidates: [],
  }

  // Definicao operacional de "sem contato" (§4.8) como filtro HARD na query
  // (criterio 24): leads em qualquer outro status (ENRICHMENT_PENDING,
  // CONTACTED, NEGOTIATING, CONVERTED, terminais) nunca entram no lote.
  const leads = await prisma.lead.findMany({
    where: {
      status: 'NEW',
      email: null,
      // Review 06-11 R3-2 (emenda da definicao §4.8): phone E phoneNormalized
      // nulos. phoneNormalized so e garantido no CREATE da pipeline — lead
      // legado com phone preenchido e phoneNormalized null tem canal real e
      // NUNCA pode ser desqualificado (falso descarte vetado pelo gate T-09).
      phone: null,
      phoneNormalized: null,
      website: null,
      instagramHandle: null,
      facebookUrl: null,
      // Armadilha Prisma: { isWhatsappChannel: { not: true } } EXCLUI null em
      // boolean nullable — null e false precisam entrar explicitamente.
      OR: [{ isWhatsappChannel: null }, { isWhatsappChannel: false }],
      ...(userId ? { userId } : {}),
      ...(niche ? { niche } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: {
      id: true,
      userId: true,
      businessName: true,
      niche: true,
      enrichmentData: true,
      // Criterio 23: fonte do lead = source da primeira RawLeadData vinculada.
      rawLeadData: { select: { source: true }, take: 1 },
    },
  })

  for (const lead of leads) {
    report.evaluated++

    // Criterio 26 (DEC-MARCADOR-DESCOBERTA): sem marcador de descoberta de
    // contato concluida o lead NAO e elegivel — fail-closed.
    const marker = readContactDiscovery(lead.enrichmentData)
    if (!marker) {
      report.skippedNoMarker++
      continue
    }

    // WhatsApp 'confirmed' OU 'probable' segura o lead no funil (§4.8 — so
    // 'unknown'/ausente conta como sem canal).
    const whatsapp = readWhatsappEnrichment(lead.enrichmentData)
    if (whatsapp && (whatsapp.level === 'confirmed' || whatsapp.level === 'probable')) {
      report.skippedHasChannel++
      continue
    }

    report.noContact++
    const nicheKey = lead.niche ?? NICHE_FALLBACK_KEY
    report.byNiche[nicheKey] = (report.byNiche[nicheKey] ?? 0) + 1
    // Criterio 23: quebra por fonte de coleta — sem raw vinculada, 'sem-fonte'.
    const sourceKey = lead.rawLeadData[0]?.source ?? SOURCE_FALLBACK_KEY
    report.bySource[sourceKey] = (report.bySource[sourceKey] ?? 0) + 1
    report.candidates.push({ id: lead.id, businessName: lead.businessName, niche: lead.niche })

    if (!apply) continue

    // Transicao EXCLUSIVAMENTE via o servico das rotas: valida a state machine
    // de transitions.ts, registra historico de status e aplica os side-effects
    // canonicos (retentionUntil +15d). NUNCA DISCARDED/FALSE_POSITIVE.
    try {
      await leadService.updateStatus(lead.id, lead.userId, { status: 'DISQUALIFIED' })
    } catch (err) {
      // Race com operador (status mudou entre query e update) ou lead sumiu:
      // loga e CONTINUA o lote — nunca aborta tudo, nunca forca a transicao.
      console.error(
        `[contactability] transicao falhou para lead ${lead.id} (race?):`,
        err instanceof Error ? err.message : err,
      )
      report.skippedRace++
      continue
    }
    report.disqualified++

    // Razao canonica: best-effort no padrao do history-tracker (falha aqui nao
    // desfaz a transicao nem aborta o lote, apenas loga).
    try {
      await prisma.leadHistory.create({
        data: {
          leadId: lead.id,
          field: 'disqualify_reason',
          oldValue: Prisma.DbNull,
          newValue: NO_CONTACT_REASON,
        },
      })
    } catch (err) {
      console.error(
        `[contactability] registro de disqualify_reason falhou para lead ${lead.id}:`,
        err instanceof Error ? err.message : err,
      )
    }

    if (retentionDecision !== 'keep') continue

    // Retencao diferenciada (R2-4): tira o lead da janela de purge fisico com
    // retry. Em falha definitiva a transicao NAO e desfeita — o report acumula
    // o id para correcao manual dentro da janela de 15 dias e o lote continua.
    const overridden = await clearRetentionWithRetry(prisma, lead.id)
    if (!overridden) {
      report.retentionOverrideFailures++
      report.retentionOverrideFailedIds.push(lead.id)
      continue
    }

    // Politica registrada SO apos o zeramento confirmado (auditoria/medicao de
    // requalificacao) — best-effort no mesmo padrao da razao acima.
    try {
      await prisma.leadHistory.create({
        data: {
          leadId: lead.id,
          field: 'retention_policy',
          oldValue: Prisma.DbNull,
          newValue: RETENTION_KEEP_VALUE,
        },
      })
    } catch (err) {
      console.error(
        `[contactability] registro de retention_policy falhou para lead ${lead.id}:`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  return report
}

export interface RequalificationRateReport {
  /** Leads com LeadHistory disqualify_reason=no_contact_channel na janela. */
  disqualifiedByJob: number
  /** Subconjunto com transicao DISQUALIFIED -> NEW posterior a desqualificacao. */
  requalified: number
  /** requalified / disqualifiedByJob em % (0 quando nao ha desqualificados). */
  ratePct: number
}

/**
 * Mede a taxa de requalificacao DISQUALIFIED -> NEW dos leads desqualificados
 * pelo job (gate T-08: <= 5%, medida DENTRO da janela de 15 dias, antes do
 * purge fisico). Cruza LeadHistory `disqualify_reason` = no_contact_channel
 * com transicoes de `status` DISQUALIFIED -> NEW posteriores.
 */
export async function measureRequalificationRate(
  prisma: PrismaClient,
  opts: { sinceDays?: number } = {},
): Promise<RequalificationRateReport> {
  const sinceDays = opts.sinceDays ?? 15
  const since = new Date(Date.now() - sinceDays * 86_400_000)

  const disqualifyRows = await prisma.leadHistory.findMany({
    where: {
      field: 'disqualify_reason',
      newValue: { equals: NO_CONTACT_REASON },
      changedAt: { gte: since },
    },
    orderBy: { changedAt: 'asc' },
    select: { leadId: true, changedAt: true },
  })

  if (disqualifyRows.length === 0) {
    return { disqualifiedByJob: 0, requalified: 0, ratePct: 0 }
  }

  // Primeira desqualificacao por lead (rows vem em ordem ascendente).
  const firstDisqualifiedAt = new Map<string, Date>()
  for (const row of disqualifyRows) {
    if (!firstDisqualifiedAt.has(row.leadId)) firstDisqualifiedAt.set(row.leadId, row.changedAt)
  }

  const statusRows = await prisma.leadHistory.findMany({
    where: {
      leadId: { in: [...firstDisqualifiedAt.keys()] },
      field: 'status',
      changedAt: { gte: since },
    },
    select: { leadId: true, oldValue: true, newValue: true, changedAt: true },
  })

  const requalifiedIds = new Set<string>()
  for (const row of statusRows) {
    const disqualifiedAt = firstDisqualifiedAt.get(row.leadId)
    if (!disqualifiedAt) continue
    if (
      row.oldValue === 'DISQUALIFIED' &&
      row.newValue === 'NEW' &&
      row.changedAt.getTime() >= disqualifiedAt.getTime()
    ) {
      requalifiedIds.add(row.leadId)
    }
  }

  const disqualifiedByJob = firstDisqualifiedAt.size
  const requalified = requalifiedIds.size
  const ratePct =
    disqualifiedByJob > 0 ? Math.round((requalified / disqualifiedByJob) * 10000) / 100 : 0

  return { disqualifiedByJob, requalified, ratePct }
}
