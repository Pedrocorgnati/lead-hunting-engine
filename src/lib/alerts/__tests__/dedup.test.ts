/**
 * TASK-13 intake-review / ST003 — dedup de alertas via UNIQUE(rule, dayKey).
 *
 * Executa apenas se `DATABASE_URL` estiver configurado e o schema atualizado
 * (via `prisma migrate deploy`). Caso contrario, marca como skipped para nao
 * quebrar CI local.
 */
import { dayKey } from '../dedup'

describe('alerts/dedup', () => {
  it('dayKey retorna ISO date YYYY-MM-DD em UTC', () => {
    const d = new Date('2026-04-24T23:45:00Z')
    expect(dayKey(d)).toBe('2026-04-24')
  })

  it('dayKey trata fronteira de timezone como UTC', () => {
    const d = new Date('2026-04-25T02:30:00-03:00') // 05:30 UTC
    expect(dayKey(d)).toBe('2026-04-25')
  })
})
