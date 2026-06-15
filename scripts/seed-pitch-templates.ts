/**
 * scripts/seed-pitch-templates.ts
 *
 * Aplica o conjunto canônico de pitch templates (src/lib/pitch/seed-templates.ts)
 * para todos os usuários: remove os 3 templates seed antigos (placeholders
 * quebrados) e upserta os novos por (userId, name). Idempotente.
 *
 * Uso: pnpm tsx scripts/seed-pitch-templates.ts
 */
import 'dotenv/config'
import { createSeedClient } from '../prisma/seed/client'
import { SEED_PITCH_TEMPLATES, LEGACY_TEMPLATE_NAMES } from '../src/lib/pitch/seed-templates'

async function main() {
  const prisma = createSeedClient()
  try {
    const users = await prisma.userProfile.findMany({ select: { id: true, email: true } })
    let removed = 0
    let upserted = 0
    for (const user of users) {
      const del = await prisma.pitchTemplate.deleteMany({
        where: { userId: user.id, name: { in: LEGACY_TEMPLATE_NAMES } },
      })
      removed += del.count
      for (const t of SEED_PITCH_TEMPLATES) {
        const existing = await prisma.pitchTemplate.findFirst({ where: { userId: user.id, name: t.name }, select: { id: true } })
        const data = { name: t.name, content: t.content, tone: t.tone, channel: t.channel, subject: t.subject ?? null, isFavorite: t.isFavorite ?? false }
        if (existing) await prisma.pitchTemplate.update({ where: { id: existing.id }, data })
        else await prisma.pitchTemplate.create({ data: { ...data, userId: user.id } })
        upserted += 1
      }
    }
    console.log(`[seed-pitch-templates] ${users.length} usuário(s) · ${removed} legados removidos · ${upserted} templates aplicados (${SEED_PITCH_TEMPLATES.length}/usuário)`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => { console.error('[seed-pitch-templates] erro:', e instanceof Error ? e.message : e); process.exitCode = 1 })
