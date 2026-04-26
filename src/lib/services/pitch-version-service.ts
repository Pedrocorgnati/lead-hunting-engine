import { prisma } from '@/lib/prisma'

const MAX_VERSIONS_PER_LEAD = 10

export interface SnapshotPitchInput {
  leadId: string
  content: string
  tone?: string | null
  provider?: string | null
  changedBy?: string | null
}

/**
 * Registra versao anterior do pitch antes de sobrescrever.
 * Mantem no maximo 10 versoes por lead (descarta mais antigas).
 */
export async function snapshotPitchVersion(input: SnapshotPitchInput): Promise<void> {
  if (!input.content || !input.content.trim()) return
  await prisma.$transaction(async (tx) => {
    await tx.pitchVersion.create({
      data: {
        leadId: input.leadId,
        content: input.content,
        tone: input.tone ?? null,
        provider: input.provider ?? null,
        changedBy: input.changedBy ?? null,
      },
    })
    const excess = await tx.pitchVersion.findMany({
      where: { leadId: input.leadId },
      orderBy: { createdAt: 'desc' },
      skip: MAX_VERSIONS_PER_LEAD,
      select: { id: true },
    })
    if (excess.length > 0) {
      await tx.pitchVersion.deleteMany({
        where: { id: { in: excess.map((v) => v.id) } },
      })
    }
  })
}

export async function listPitchVersions(leadId: string) {
  return prisma.pitchVersion.findMany({
    where: { leadId },
    orderBy: { createdAt: 'desc' },
    take: MAX_VERSIONS_PER_LEAD,
  })
}
