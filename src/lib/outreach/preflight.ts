import 'server-only'

/**
 * outreach-engine (brainstorm 06-10, task 01): pre-checagem obrigatoria de
 * QUALQUER fluxo outbound. O sistema so entra em envio automatico com a
 * pre-validacao verde (principio 1.1 do fonte).
 *
 * Checks (todos com dono explicito em SystemConfig outreach.owners):
 *  1. kill_switch global LIGADO (enabled=true) — desligado = zero envio
 *     (estado seguro; task 01/11). Leitura SEM cache.
 *  2. Infra de supressao respondendo — indisponivel => forca DRY_RUN
 *     (contingencia 9.1), nunca envio real.
 *  3. dry_run global — ligado => simulacao.
 *  4. Campanha: ACTIVE, sem killSwitch local, com aprovacao humana
 *     registrada (approvedBy/At — criterio de falha 1 da Fase 1).
 *  5. Gate de mercado/pais (task 16/F-16): mercado fora da lista permitida
 *     exige aprovacao manual registrada na campanha.
 *  6. Caixa saudavel (task 14): nenhuma mensagem sai de caixa unhealthy.
 *
 * Toda execucao deixa trilha em telemetria ('outreach.preflight') — Zero
 * Silencio: bloqueio nunca e silencioso.
 */
import type { OutreachCampaign, OutreachMailbox } from '@prisma/client'
import {
  getOutreachKillSwitch,
  getOutreachDryRun,
  getOutreachMarketGates,
} from '@/lib/services/system-config'
import { suppressionInfraHealthy } from './suppression'
import { computeMailboxHealth } from './mailbox-service'
import { track, makeCorrelationId } from '@/lib/telemetry'

export interface PreflightResult {
  /** false => NENHUM envio (nem dry-run) deve prosseguir. */
  allowed: boolean
  /** true => prossegue apenas em simulacao (sem contato externo). */
  dryRun: boolean
  reasons: string[]
  checks: Array<{ name: string; ok: boolean; detail?: string }>
}

export interface PreflightContext {
  campaign?: Pick<
    OutreachCampaign,
    | 'id'
    | 'status'
    | 'killSwitch'
    | 'dryRun'
    | 'approvedBy'
    | 'approvedAt'
    | 'market'
    | 'marketGateApprovedBy'
    | 'marketGateApprovedAt'
  > | null
  mailbox?: OutreachMailbox | null
  userId?: string | null
  correlationId?: string
}

export async function checkOutboundPreconditions(
  context: PreflightContext = {},
): Promise<PreflightResult> {
  const reasons: string[] = []
  const checks: PreflightResult['checks'] = []
  let allowed = true
  let dryRun = false

  // 1. Kill switch global (sem cache — emergencia nao espera TTL).
  const killSwitch = await getOutreachKillSwitch()
  checks.push({ name: 'kill_switch_global', ok: killSwitch.enabled })
  if (!killSwitch.enabled) {
    allowed = false
    reasons.push('kill_switch global desligado — envio outbound bloqueado (estado seguro)')
  }

  // 2. Supressao disponivel? (contingencia 9.1: indisponivel => DRY_RUN)
  const suppressionOk = await suppressionInfraHealthy()
  checks.push({ name: 'suppression_infra', ok: suppressionOk })
  if (!suppressionOk) {
    dryRun = true
    reasons.push('infra de supressao indisponivel — pipeline degradado para DRY_RUN (regra 9.1)')
  }

  // 3. Dry-run global.
  const globalDryRun = await getOutreachDryRun()
  checks.push({ name: 'dry_run_global', ok: !globalDryRun.enabled })
  if (globalDryRun.enabled) {
    dryRun = true
    reasons.push('dry_run global ativo — envio simulado, sem contato externo')
  }

  // 4. Campanha.
  if (context.campaign) {
    const c = context.campaign
    const campaignActive = c.status === 'ACTIVE'
    checks.push({ name: 'campaign_active', ok: campaignActive, detail: c.status })
    if (!campaignActive) {
      allowed = false
      reasons.push(`campanha em status ${c.status} — apenas ACTIVE envia`)
    }
    checks.push({ name: 'campaign_kill_switch', ok: !c.killSwitch })
    if (c.killSwitch) {
      allowed = false
      reasons.push('kill_switch da campanha acionado')
    }
    const approved = Boolean(c.approvedBy && c.approvedAt)
    checks.push({ name: 'campaign_human_approval', ok: approved })
    if (!approved) {
      allowed = false
      reasons.push('campanha sem aprovacao humana registrada (Fase 1: revisao antes de massa)')
    }
    if (c.dryRun) {
      dryRun = true
      reasons.push('campanha em modo dry_run')
    }

    // 5. Gate de mercado (task 16/F-16).
    const gates = await getOutreachMarketGates()
    const market = (c.market ?? 'BR').toUpperCase()
    const marketAllowed = gates.allowed.map((m) => m.toUpperCase()).includes(market)
    const marketApproved = Boolean(c.marketGateApprovedBy && c.marketGateApprovedAt)
    let marketOk: boolean
    if (marketAllowed) {
      marketOk = true
    } else if (gates.defaultPolicy === 'block') {
      marketOk = false
    } else {
      // require_approval (default) e lista requireApproval: aprovacao manual.
      marketOk = marketApproved
    }
    checks.push({ name: 'market_gate', ok: marketOk, detail: market })
    if (!marketOk) {
      allowed = false
      reasons.push(
        `mercado ${market} fora da lista permitida e sem aprovacao manual registrada (gate F-16)`,
      )
    }
  }

  // 6. Caixa saudavel.
  if (context.mailbox) {
    const health = await computeMailboxHealth(context.mailbox)
    checks.push({
      name: 'mailbox_health',
      ok: health.healthy,
      detail: health.reasons.join('; ') || undefined,
    })
    if (!health.healthy) {
      allowed = false
      reasons.push(`caixa ${context.mailbox.emailAddress} nao saudavel: ${health.reasons.join('; ')}`)
    }
  }

  const result: PreflightResult = { allowed, dryRun, reasons, checks }

  // Trilha explicita de pre-checagem (Aceite task 01) — best-effort.
  await track({
    kind: 'outreach.preflight',
    correlationId: context.correlationId ?? makeCorrelationId('preflight'),
    userId: context.userId ?? null,
    resourceType: 'outreach_campaign',
    resourceId: context.campaign?.id,
    metadata: {
      allowed,
      dryRun,
      reasons,
      checks: checks.map((c) => `${c.name}=${c.ok ? 'ok' : 'FAIL'}`),
    },
  }).catch(() => undefined)

  return result
}
