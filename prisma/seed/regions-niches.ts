/**
 * prisma/seed/regions-niches.ts
 *
 * Seed idempotente (upsert) de Regions (27 UFs) e Niches (12 nichos brasileiros).
 * Origem: INTAKE-REVIEW TASK-7 — CL-019, CL-021.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PrismaClient } from '@prisma/client'

interface RegionSeed {
  uf: string
  name: string
  capital: string
  cities: string[]
}

interface NicheSeed {
  slug: string
  label: string
  keywords: string[]
}

const DATA_DIR = join(__dirname, '..', 'data')

export async function seedRegionsAndNiches(prisma: PrismaClient): Promise<void> {
  const regions: RegionSeed[] = JSON.parse(
    readFileSync(join(DATA_DIR, 'regions.json'), 'utf8'),
  )
  const niches: NicheSeed[] = JSON.parse(
    readFileSync(join(DATA_DIR, 'niches.json'), 'utf8'),
  )

  for (const r of regions) {
    await prisma.region.upsert({
      where: { uf: r.uf },
      update: { name: r.name, capital: r.capital, cities: r.cities },
      create: { uf: r.uf, name: r.name, capital: r.capital, cities: r.cities },
    })
  }

  for (const n of niches) {
    await prisma.niche.upsert({
      where: { slug: n.slug },
      update: { label: n.label, keywords: n.keywords },
      create: { slug: n.slug, label: n.label, keywords: n.keywords },
    })
  }

  console.log(`  ✓ Regions (${regions.length}) + Niches (${niches.length})`)
}
