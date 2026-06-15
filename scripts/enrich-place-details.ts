/**
 * scripts/enrich-place-details.ts
 *
 * Backfill de website + telefone via Google Place Details para leads coletados
 * pelo Google TextSearch (que nao retorna esses campos). O place_id fica em
 * RawLeadData.externalId (ligado ao Lead via leadId); copiamos tambem para
 * Lead.placeId. Espelha os fields de google-my-business.ts::fetchGmb sem a
 * dependencia de kv-cache (redis/server-only sob tsx).
 *
 * Uso: pnpm tsx scripts/enrich-place-details.ts <jobId>
 * Pre-req: GOOGLE_PLACES_API_KEY no .env.
 */
import 'dotenv/config'
import { createSeedClient } from '../prisma/seed/client'
import { normalizePhoneE164 } from '../src/lib/workers/utils/data-normalizer'

const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place'
const FIELDS = ['place_id', 'name', 'formatted_phone_number', 'international_phone_number', 'website', 'url'].join(',')

async function fetchDetails(placeId: string, apiKey: string) {
  const url = new URL(`${PLACES_BASE}/details/json`)
  url.searchParams.set('place_id', placeId)
  url.searchParams.set('language', 'pt-BR')
  url.searchParams.set('fields', FIELDS)
  url.searchParams.set('key', apiKey)
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) })
  const json = (await res.json()) as { status: string; result?: Record<string, unknown> }
  if (json.status !== 'OK' || !json.result) return { website: null as string | null, phone: null as string | null, status: json.status }
  const r = json.result
  return {
    website: (r.website as string) ?? null,
    phone: (r.international_phone_number as string) ?? (r.formatted_phone_number as string) ?? null,
    status: 'OK',
  }
}

async function main() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY ausente no .env')
  const jobId = process.argv[2]
  if (!jobId) throw new Error('uso: pnpm tsx scripts/enrich-place-details.ts <jobId>')

  const prisma = createSeedClient()
  try {
    const raws = (await prisma.rawLeadData.findMany({
      where: { jobId, leadId: { not: null } },
      select: { externalId: true, leadId: true, businessName: true },
    } as never)) as Array<{ externalId: string | null; leadId: string | null; businessName: string | null }>

    console.log(`=== enriquecendo ${raws.length} leads do job ${jobId} via Place Details ===\n`)
    let withSite = 0, noSite = 0, skipped = 0

    for (const [i, raw] of raws.entries()) {
      const label = `${i + 1}. ${raw.businessName ?? '-'}`
      if (!raw.externalId || !raw.leadId) { console.log(`${label} | sem place_id/lead`); skipped++; continue }
      const d = await fetchDetails(raw.externalId, apiKey)
      if (d.status !== 'OK') { console.log(`${label} | Place Details status=${d.status}`); skipped++; continue }
      // Review 06-11 R3-5: spreads condicionais espelhando process-leads-core —
      // result OK sem website/phone retornava null e o update incondicional
      // APAGAVA valores que o lead ja tinha (regressao destrutiva). Tambem
      // grava phoneNormalized junto do phone (gap do F2/R3-2).
      const existing = (await prisma.lead.findUnique({
        where: { id: raw.leadId },
        select: { website: true },
      } as never)) as { website: string | null } | null
      await prisma.lead.update({
        where: { id: raw.leadId },
        data: {
          placeId: raw.externalId,
          ...(d.website ? { website: d.website } : {}),
          ...(d.phone ? { phone: d.phone, phoneNormalized: normalizePhoneE164(d.phone) } : {}),
        } as never,
      })
      // 'SEM SITE' considera o site EFETIVO (novo OU pre-existente) — o
      // proprio script nao pode classificar como alvo um lead cujo site ele
      // deixou de sobrescrever.
      const effectiveWebsite = d.website ?? existing?.website ?? null
      if (effectiveWebsite) { withSite++; console.log(`${label}\n     site: ${effectiveWebsite}\n     tel:  ${d.phone ?? '-'}`) }
      else { noSite++; console.log(`${label}\n     SEM SITE  <-- alvo SystemForge | tel: ${d.phone ?? '-'}`) }
      await new Promise((r) => setTimeout(r, 200))
    }

    console.log(`\n=== resumo: ${withSite} com site | ${noSite} SEM SITE (prospects quentes) | ${skipped} pulados ===`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => { console.error('[enrich-place-details] erro:', (e as Error).message); process.exit(1) })
