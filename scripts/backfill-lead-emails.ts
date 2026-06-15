/**
 * scripts/backfill-lead-emails.ts
 *
 * WRAPPER DE COMPATIBILIDADE (review 06-11 R3-6) — o experimento original
 * deste script foi promovido para o worker oficial
 * `src/lib/workers/email-discovery-worker.ts` e o write-path antigo foi
 * APOSENTADO: ele aplicava primary sem o gate de dominio externo (T-05),
 * gravava sem guard de corrida nem DataProvenance (criterio 15) e passava
 * `lead.enrichmentData` como se fosse o rawJson do provider (proveniencia
 * errada e pior que ausente, criterio 16).
 *
 * Este wrapper delega 100% da execucao para `runEmailDiscoveryWorker`,
 * preservando as flags historicas (--apply, --limit, --niche, --user) para
 * nao quebrar invocacoes existentes. Operacionalmente, prefira o CLI
 * canonico: `pnpm tsx scripts/run-email-discovery.ts`.
 *
 * Seguro por padrao: DRY-RUN (nao grava nada, nem marcador de crawl).
 */
import 'dotenv/config'
import { createSeedClient } from '../prisma/seed/client'
import { runEmailDiscoveryWorker } from '../src/lib/workers/email-discovery-worker'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const LIMIT = Number(args[args.indexOf('--limit') + 1]) || 50
const NICHE = args.includes('--niche') ? args[args.indexOf('--niche') + 1] : undefined
const USER = args.includes('--user') ? args[args.indexOf('--user') + 1] : undefined

async function main() {
  console.log(
    '[backfill] AVISO: este script virou wrapper do worker oficial ' +
      '(scripts/run-email-discovery.ts) — o write-path antigo foi aposentado ' +
      'por bypassar os gates T-04/T-05, o guard de corrida e a proveniencia.',
  )
  const prisma = createSeedClient()
  try {
    const report = await runEmailDiscoveryWorker({
      prisma,
      apply: APPLY,
      limit: LIMIT,
      niche: NICHE,
      userId: USER,
    })

    const rate = report.scanned ? ((report.found / report.scanned) * 100).toFixed(1) : '0'
    console.log(
      `\n[backfill] RESULTADO (${report.dryRun ? 'DRY-RUN' : 'APPLY'}): ` +
        `${report.scanned} analisados · ${report.fetched} sites acessados · ` +
        `${report.found} e-mails encontrados (${rate}%) · ${report.eligibleAfter} ficariam elegíveis · ` +
        `${report.applied} gravados · ${report.skippedExternalPrimary} descartados por domínio externo`,
    )
    if (report.dryRun && report.found > 0) console.log('[backfill] DRY-RUN: rode com --apply para gravar.')
    if (report.found === 0) console.log('[backfill] Zero e-mails: consistente com ICP sem site/sem e-mail. Considere WhatsApp/telefone como canal.')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => { console.error('[backfill] erro:', e instanceof Error ? e.message : e); process.exitCode = 1 })
