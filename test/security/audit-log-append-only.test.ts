/**
 * TASK-24 intake-review (CL-352): garante que a trigger append-only
 * bloqueia UPDATE/DELETE em `audit_logs` e permite INSERT.
 *
 * Requisitos para rodar:
 *  - DATABASE_URL apontando para staging/dev (NUNCA prod)
 *  - Migration `20260424000003_audit_log_append_only` aplicada
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function isAppendOnlyError(err: unknown): boolean {
  if (!err) return false
  const message = err instanceof Error ? err.message : String(err)
  return /append-only/i.test(message)
}

describe('audit_logs append-only trigger', () => {
  let seededId: string | null = null

  beforeAll(async () => {
    const created = await prisma.auditLog.create({
      data: {
        action: 'test.append_only_setup',
        resource: 'security_test',
        metadata: { source: 'TASK-24 regression' },
      },
      select: { id: true },
    })
    seededId = created.id
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('permite INSERT (sanity check)', async () => {
    const created = await prisma.auditLog.create({
      data: {
        action: 'test.append_only_insert',
        resource: 'security_test',
      },
      select: { id: true },
    })
    expect(created.id).toBeTruthy()
  })

  it('bloqueia UPDATE em row existente', async () => {
    expect(seededId).toBeTruthy()
    await expect(
      prisma.auditLog.update({
        where: { id: seededId! },
        data: { action: 'tampered' },
      })
    ).rejects.toThrow()
  })

  it('bloqueia DELETE em row existente', async () => {
    expect(seededId).toBeTruthy()
    await expect(
      prisma.auditLog.delete({ where: { id: seededId! } })
    ).rejects.toThrow()
  })

  it('bloqueia updateMany em lote', async () => {
    await expect(
      prisma.auditLog.updateMany({
        where: { resource: 'security_test' },
        data: { action: 'tampered_many' },
      })
    ).rejects.toThrow()
  })
})
