/**
 * Consent Traceability — COMP-003 Verification Utility
 * Referência: TASK-2/ST001
 *
 * Uso manual:
 *   npx ts-node --project tsconfig.json test/audit/consent-traceability.ts <userId>
 *
 * Verifica que termsAcceptedAt está preenchido para o usuário informado.
 * Lança exceção com código COMP-003 se o campo estiver nulo.
 */

import { prisma } from '../../src/lib/prisma'

export async function verifyConsentTraceability(userId: string): Promise<{
  valid: boolean
  termsAcceptedAt: Date
}> {
  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { termsAcceptedAt: true, email: true },
  })

  if (!profile) {
    throw new Error(`COMP-003 VIOLATION: UserProfile não encontrado para userId ${userId}`)
  }

  if (!profile.termsAcceptedAt) {
    throw new Error(
      `COMP-003 VIOLATION: termsAcceptedAt is null for user ${userId} (${profile.email}). ` +
        'Verificar se a ativação foi concluída corretamente.'
    )
  }

  const ageMs = Date.now() - profile.termsAcceptedAt.getTime()
  // eslint-disable-next-line no-console
  console.log(
    `[COMP-003] termsAcceptedAt: ${profile.termsAcceptedAt.toISOString()} ` +
      `(${Math.floor(ageMs / 1000)}s ago) ✓`
  )

  return { valid: true, termsAcceptedAt: profile.termsAcceptedAt }
}

// Execução direta via CLI
const userId = process.argv[2]
if (userId) {
  verifyConsentTraceability(userId)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message)
      process.exit(1)
    })
}
