/**
 * scripts/run-contactability-job.ts
 *
 * CLI do job de contatabilidade (Task 7 do doc blacksmith 06-11): avalia leads
 * em status NEW sem NENHUM canal de contato apos descoberta concluida e os
 * desqualifica (DISQUALIFIED, estado reversivel) — DRY-RUN por default.
 *
 * Uso:
 *   pnpm tsx scripts/run-contactability-job.ts [--apply] [--limit N] [--user <id>]
 *     [--niche "x"] [--retention-decision <purge-15d|keep>] [--report-requalification]
 *
 * Gates do doc (§11.1):
 *   T-08: taxa de requalificacao DISQUALIFIED -> NEW <= 5%, medida DENTRO da
 *         janela de 15 dias (antes do purge fisico) — ver --report-requalification.
 *   T-09: amostragem manual minima de 30 leads do dry-run (ou 100% se houver
 *         menos) com ZERO falso descarte antes de qualquer --apply.
 *
 * --apply exige --retention-decision: DEC-RETENCAO-DESCARTE segue aberta no
 * doc da feature; o purge fisico de 15 dias do DISQUALIFIED nao pode ser
 * efeito colateral nao declarado.
 */
import 'dotenv/config'
import path from 'node:path'
import Module from 'node:module'
import { createSeedClient } from '../prisma/seed/client'
import type { RetentionDecision } from '../src/lib/jobs/contactability-job'

// O job importa lead.service -> @/lib/prisma -> 'server-only', modulo virtual
// do Next que nao resolve sob tsx. Reaproveitamos o stub do jest ANTES de
// carregar o job — por isso o import dele e dinamico, dentro de main().
const moduleInternals = Module as unknown as {
  _resolveFilename: (request: string, ...rest: unknown[]) => string
}
const originalResolveFilename = moduleInternals._resolveFilename
moduleInternals._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request === 'server-only') {
    return path.resolve(__dirname, '../src/__tests__/__mocks__/server-only.ts')
  }
  return originalResolveFilename.call(this, request, ...rest)
}

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const LIMIT = Number(args[args.indexOf('--limit') + 1]) || 100
const USER = args.includes('--user') ? args[args.indexOf('--user') + 1] : undefined
const NICHE = args.includes('--niche') ? args[args.indexOf('--niche') + 1] : undefined
const RETENTION = args.includes('--retention-decision')
  ? args[args.indexOf('--retention-decision') + 1]
  : undefined
const REPORT_REQUALIFICATION = args.includes('--report-requalification')

if (RETENTION !== undefined && RETENTION !== 'purge-15d' && RETENTION !== 'keep') {
  console.error(
    `[contactability] --retention-decision invalida: "${RETENTION}". Valores aceitos: purge-15d | keep.`,
  )
  process.exit(1)
}

async function main() {
  const prisma = createSeedClient()
  try {
    const { runContactabilityJob, measureRequalificationRate } = await import(
      '../src/lib/jobs/contactability-job'
    )

    console.log(
      `[contactability] ${APPLY ? 'APPLY' : 'DRY-RUN'} · limit ${LIMIT}` +
        `${USER ? ` · user ${USER}` : ''}${NICHE ? ` · niche "${NICHE}"` : ''}` +
        `${RETENTION ? ` · retencao ${RETENTION}` : ''}`,
    )

    const report = await runContactabilityJob({
      prisma,
      apply: APPLY,
      limit: LIMIT,
      userId: USER,
      niche: NICHE,
      retentionDecision: RETENTION as RetentionDecision | undefined,
    })

    console.log(
      `[contactability] RESULTADO: evaluated=${report.evaluated} noContact=${report.noContact} ` +
        `disqualified=${report.disqualified} skippedNoMarker=${report.skippedNoMarker} ` +
        `skippedHasChannel=${report.skippedHasChannel} skippedRace=${report.skippedRace}`,
    )
    const niches = Object.entries(report.byNiche)
    if (niches.length > 0) {
      console.log('[contactability] noContact por nicho:')
      for (const [key, count] of niches) console.log(`  ${key}: ${count}`)
    }
    // Criterio 23: quebra por fonte de coleta (primeira RawLeadData vinculada;
    // 'sem-fonte' quando o lead nao tem raw vinculada).
    const sources = Object.entries(report.bySource)
    if (sources.length > 0) {
      console.log('[contactability] noContact por fonte:')
      for (const [key, count] of sources) console.log(`  ${key}: ${count}`)
    }

    // R2-4: alerta destacado — leads com decisao 'keep' cujo zeramento de
    // retentionUntil falhou seguem na janela de purge fisico de 15 dias.
    if (report.retentionOverrideFailures > 0) {
      console.error(
        '\n======================================================================\n' +
          `[contactability] ALERTA CRITICO R2-4: ${report.retentionOverrideFailures} lead(s) ` +
          "desqualificado(s) com decisao 'keep' ficaram com retentionUntil = +15d\n" +
          '(zeramento falhou apos os retries). Sem correcao manual, o retention-cleanup\n' +
          'fara o PURGE FISICO desses leads em ate 15 dias. Corrigir AGORA, DENTRO da\n' +
          'janela, setando retentionUntil = null nos leads abaixo:\n' +
          report.retentionOverrideFailedIds.map((id) => `  ${id}`).join('\n') +
          '\n======================================================================',
      )
    }

    if (report.dryRun) {
      console.log(
        '\n[contactability] AVISO T-09: antes de qualquer --apply, amostrar manualmente ' +
          'no minimo 30 leads da lista abaixo (ou 100% se houver menos) — a liberacao do ' +
          'apply exige ZERO falso descarte (lead com canal real existente).',
      )
      if (report.candidates.length === 0) {
        console.log('[contactability] Nenhum candidato a descarte neste lote.')
      } else {
        console.log(`[contactability] ${report.candidates.length} candidatos a descarte:`)
        for (const c of report.candidates) {
          console.log(`  ${c.id} · ${c.businessName} · ${c.niche ?? 'sem-nicho'}`)
        }
      }
    }

    if (REPORT_REQUALIFICATION) {
      const requal = await measureRequalificationRate(prisma, { sinceDays: 15 })
      const withinGate = requal.ratePct <= 5
      console.log(
        `\n[contactability] requalificacao (janela 15d): ${requal.requalified}/${requal.disqualifiedByJob} ` +
          `= ${requal.ratePct}% · gate T-08 (<= 5%): ${withinGate ? 'OK' : 'ESTOURADO — suspender job e endurecer criterio'}`,
      )
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error('[contactability] erro:', e instanceof Error ? e.message : e)
  process.exitCode = 1
})
