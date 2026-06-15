/**
 * outreach-engine (06-10, tasks 07/10): supressao operacional.
 * Aceite: marca email/dominio suprimido; cooldown respeitado; infra
 * indisponivel reporta available:false (=> DRY_RUN, contingencia 9.1).
 */
jest.mock('@/lib/prisma', () => ({
  prisma: {
    suppressionEntry: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
  },
}))

import {
  normalizeEmail,
  extractDomain,
  checkSuppression,
  addSuppression,
  suppressionInfraHealthy,
} from '../suppression'
import { prisma } from '@/lib/prisma'

const findMany = prisma.suppressionEntry.findMany as jest.Mock
const upsert = prisma.suppressionEntry.upsert as jest.Mock
const count = prisma.suppressionEntry.count as jest.Mock

beforeEach(() => jest.clearAllMocks())

describe('normalizacao', () => {
  it('normaliza email para lowercase/trim', () => {
    expect(normalizeEmail('  Contato@Empresa.COM.br ')).toBe('contato@empresa.com.br')
  })

  it('extrai dominio', () => {
    expect(extractDomain('Contato@Empresa.com.BR')).toBe('empresa.com.br')
    expect(extractDomain('sem-arroba')).toBeNull()
    expect(extractDomain('truncado@')).toBeNull()
  })
})

describe('checkSuppression', () => {
  it('bloqueia por email exato (permanente)', async () => {
    findMany.mockResolvedValue([
      { kind: 'EMAIL', value: 'a@b.com', reason: 'UNSUBSCRIBED', cooldownUntil: null },
    ])
    const res = await checkSuppression('A@B.com')
    expect(res).toMatchObject({ available: true, suppressed: true, reason: 'UNSUBSCRIBED' })
  })

  it('bloqueia por dominio em cooldown ativo', async () => {
    findMany.mockResolvedValue([
      {
        kind: 'DOMAIN',
        value: 'b.com',
        reason: 'BOUNCED',
        cooldownUntil: new Date(Date.now() + 3600_000),
      },
    ])
    const res = await checkSuppression('x@b.com')
    expect(res.suppressed).toBe(true)
    expect(res.kind).toBe('DOMAIN')
  })

  it('cooldown expirado NAO bloqueia', async () => {
    findMany.mockResolvedValue([
      {
        kind: 'EMAIL',
        value: 'a@b.com',
        reason: 'BOUNCED',
        cooldownUntil: new Date(Date.now() - 1000),
      },
    ])
    const res = await checkSuppression('a@b.com')
    expect(res.suppressed).toBe(false)
  })

  it('infra indisponivel => available:false e NUNCA lanca (contingencia 9.1)', async () => {
    findMany.mockRejectedValue(new Error('db down'))
    const res = await checkSuppression('a@b.com')
    expect(res).toEqual({ available: false, suppressed: false })
  })
})

describe('addSuppression', () => {
  it('upsert idempotente com valor normalizado e cooldown', async () => {
    upsert.mockResolvedValue({ id: 'sup-1' })
    await addSuppression({ kind: 'EMAIL', value: 'X@Y.com', reason: 'BOUNCED', cooldownHours: 24 })
    const args = upsert.mock.calls[0][0]
    expect(args.where.kind_value.value).toBe('x@y.com')
    expect(args.create.cooldownUntil).toBeInstanceOf(Date)
  })
})

describe('suppressionInfraHealthy', () => {
  it('true quando a tabela responde', async () => {
    count.mockResolvedValue(0)
    expect(await suppressionInfraHealthy()).toBe(true)
  })
  it('false quando a infra falha', async () => {
    count.mockRejectedValue(new Error('down'))
    expect(await suppressionInfraHealthy()).toBe(false)
  })
})
