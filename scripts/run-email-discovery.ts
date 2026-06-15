/**
 * scripts/run-email-discovery.ts
 *
 * CLI fino do worker oficial de descoberta de e-mail
 * (`src/lib/workers/email-discovery-worker.ts`) — sucessor do experimento
 * `scripts/backfill-lead-emails.ts` (doc 06-11-aumentar-emails-lead-hunting,
 * Task 4 de §16).
 *
 * Seguro por padrao: DRY-RUN (nao grava nada, nem marcador de crawl).
 * Use --apply para persistir e-mail, integrityScore, enrichmentData
 * (whatsapp + contactDiscovery) e DataProvenance.
 *
 * Uso:
 *   pnpm tsx scripts/run-email-discovery.ts [--apply] [--limit N] [--niche "x"] [--user <id>] [--source <fonte>]
 *
 * --source (criterio 9): filtra leads pela fonte de coleta via relacao
 * rawLeadData. Aceita nome do enum DataSource case-insensitive (ex:
 * 'OUTSCRAPER') ou slug de provider (ex: 'google-places', 'here-maps');
 * valor desconhecido aborta listando os validos antes de qualquer query.
 *
 * O relatorio imprime os limiares de §11.1 calculados sobre a execucao:
 *   T-03 found/scanned >= 8%  | T-04 genericCanonical/found >= 60%
 *   T-05 externalDomain/found <= 20% | T-07 tempo medio por lead <= 10s
 * Nenhum apply deve ser aprovado com base em juizo subjetivo (criterio 27) —
 * o veredito de gate abaixo e o criterio objetivo.
 */
import 'dotenv/config'
import path from 'node:path'
import Module from 'node:module'
import { createSeedClient } from '../prisma/seed/client'

// O worker importa ProvenanceService -> @/lib/prisma -> 'server-only', modulo
// virtual do Next que nao resolve sob tsx. Mesmo stub do run-contactability-job:
// redireciona a resolucao para o mock inerte ANTES do import dinamico do worker.
interface ModuleInternals {
  _resolveFilename: (request: string, ...rest: unknown[]) => string
}
const moduleInternals = Module as unknown as ModuleInternals
const originalResolveFilename = moduleInternals._resolveFilename
moduleInternals._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request === 'server-only') {
    return path.resolve(__dirname, '../src/__tests__/__mocks__/server-only.ts')
  }
  return originalResolveFilename.call(this, request, ...rest)
}

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const LIMIT = Number(args[args.indexOf('--limit') + 1]) || 50
const NICHE = args.includes('--niche') ? args[args.indexOf('--niche') + 1] : undefined
const USER = args.includes('--user') ? args[args.indexOf('--user') + 1] : undefined
const SOURCE = args.includes('--source') ? args[args.indexOf('--source') + 1] : undefined

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return 'n/a'
  return `${((numerator / denominator) * 100).toFixed(1)}%`
}

async function main() {
  const prisma = createSeedClient()
  try {
    console.log(
      `[email-discovery] iniciando (limit ${LIMIT}${NICHE ? `, niche="${NICHE}"` : ''}${USER ? `, user=${USER}` : ''}${SOURCE ? `, source=${SOURCE}` : ''}). ${APPLY ? 'APPLY' : 'DRY-RUN'}.`,
    )
    const { runEmailDiscoveryWorker } = await import('../src/lib/workers/email-discovery-worker')
    const report = await runEmailDiscoveryWorker({
      prisma,
      apply: APPLY,
      limit: LIMIT,
      niche: NICHE,
      userId: USER,
      source: SOURCE,
    })

    console.log(`\n[email-discovery] RELATORIO (${report.dryRun ? 'DRY-RUN' : 'APPLY'}):`)
    console.log(`  scanned=${report.scanned} · fetched=${report.fetched} · found=${report.found} · applied=${report.applied}`)
    console.log(`  foundGenericCanonical=${report.foundGenericCanonical} · foundPersonal=${report.foundPersonal} · foundExternalDomain=${report.foundExternalDomain}`)
    console.log(`  eligibleAfter=${report.eligibleAfter} · skippedRace=${report.skippedRace} · skippedRecentlyCrawled=${report.skippedRecentlyCrawled} · skippedExternalPrimary=${report.skippedExternalPrimary}`)
    console.log(`  whatsappConfirmed=${report.whatsappConfirmed} · waNumbersExtracted=${report.waNumbersExtracted}`)
    console.log(`  errors=${report.errors} · errorsByClass=${JSON.stringify(report.errorsByClass)}`)
    console.log(`  avgMsPerLead=${report.avgMsPerLead}ms · foundRate=${pct(report.found, report.scanned)}`)

    // Gates de §11.1 (defaults provisorios; override registrado no doc vale).
    const t03 = report.foundRate >= 0.08
    const t04 = report.found > 0 && report.foundGenericCanonical / report.found >= 0.6
    const t05 = report.found === 0 || report.foundExternalDomain / report.found <= 0.2
    const t07 = report.avgMsPerLead <= 10_000
    console.log('\n[email-discovery] GATES §11.1:')
    console.log(`  T-03 found/scanned >= 8%............ ${pct(report.found, report.scanned)} → ${t03 ? 'PASS' : 'FAIL'}`)
    console.log(`  T-04 genericCanonical/found >= 60%.. ${pct(report.foundGenericCanonical, report.found)} → ${t04 ? 'PASS' : 'FAIL'}`)
    console.log(`  T-05 externalDomain/found <= 20%.... ${pct(report.foundExternalDomain, report.found)} → ${t05 ? 'PASS' : 'FAIL'}`)
    console.log(`  T-07 tempo medio por lead <= 10s.... ${report.avgMsPerLead}ms → ${t07 ? 'PASS' : 'FAIL'}`)
    const gate = t03 && t04 && t05 && t07
    console.log(`  VEREDITO: apply ${gate ? 'LIBERADO pelos limiares' : 'BLOQUEADO (ver acoes por gate em §11.1 do doc)'}`)

    if (report.dryRun) {
      console.log('\n[email-discovery] DRY-RUN: nada foi gravado. Rode com --apply somente apos o veredito de gate passar.')
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error('[email-discovery] erro:', e instanceof Error ? e.message : e)
  process.exitCode = 1
})
