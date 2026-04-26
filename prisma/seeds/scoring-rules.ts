/**
 * DEPRECATED — caminho legado.
 *
 * O seed canônico vive em `prisma/seed/scoring-rules.ts` (pasta `seed/`,
 * singular) e importa de `src/lib/scoring/default-rules.ts`.
 *
 * Mantido apenas como redirect para scripts legados que ainda apontem para
 * este caminho.
 */

console.warn(
  '[seed] prisma/seeds/scoring-rules.ts está deprecado. Use `npx tsx prisma/seed/scoring-rules.ts` ou `npm run seed:dev`.',
)

import('../seed/scoring-rules').catch((err) => {
  console.error('[legacy seed redirect] Error:', err)
  process.exit(1)
})
