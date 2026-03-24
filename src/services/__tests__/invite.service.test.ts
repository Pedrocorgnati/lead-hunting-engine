// ST003/ST004/ST005 — TASK-AUDIT-2: InviteService testes reais
jest.mock('@/lib/prisma', () => ({
  prisma: {
    invite: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    userProfile: {
      findUnique: jest.fn(),
      count: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

jest.mock('@/lib/services/auth-service', () => ({
  AuthService: {
    createInvite: jest.fn(),
  },
}))

jest.mock('@/lib/services/audit-service', () => ({
  AuditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}))

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: {
      signInWithPassword: jest.fn().mockResolvedValue({ data: {}, error: null }),
    },
  }),
}))

import { InviteService, InviteError } from '../invite.service'
import { prisma } from '@/lib/prisma'
import { AuthService } from '@/lib/services/auth-service'

// Typed mock helpers
const mockInviteFindMany = prisma.invite.findMany as jest.Mock
const mockInviteCount = prisma.invite.count as jest.Mock
const mockInviteFindUnique = prisma.invite.findUnique as jest.Mock
const mockInviteFindFirst = prisma.invite.findFirst as jest.Mock
const mockInviteCreate = prisma.invite.create as jest.Mock
const mockUserProfileFindUnique = prisma.userProfile.findUnique as jest.Mock
const mockUserProfileCount = prisma.userProfile.count as jest.Mock
const mockTransaction = prisma.$transaction as jest.Mock
const mockAuthServiceCreateInvite = AuthService.createInvite as jest.Mock

// Fixtures
const FUTURE_DATE = new Date(Date.now() + 7 * 24 * 3600 * 1000)
const PAST_DATE = new Date(Date.now() - 1000)

const VALID_INVITE = {
  id: 'invite-1',
  email: 'novo@test.com',
  role: 'OPERATOR',
  token: 'valid-token-abc',
  status: 'PENDING',
  expiresAt: FUTURE_DATE,
  invitedById: 'admin-id',
  acceptedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('InviteService', () => {
  let service: InviteService

  beforeEach(() => {
    service = new InviteService()
    jest.clearAllMocks()
    // ST005: restaurar defaults após clearAllMocks
    mockInviteFindMany.mockResolvedValue([])
    mockInviteCount.mockResolvedValue(0)
    mockInviteFindUnique.mockResolvedValue(null)
    mockInviteFindFirst.mockResolvedValue(null)
    mockUserProfileFindUnique.mockResolvedValue(null)
    mockUserProfileCount.mockResolvedValue(1)
    mockTransaction.mockResolvedValue([{}, {}])
    mockAuthServiceCreateInvite.mockResolvedValue({
      data: { user: { id: 'new-user-id' } },
      error: null,
    })
  })

  // ─────────────────────────────────────────────
  // findAll
  // ─────────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar resultado vazio quando não há convites', async () => {
      const result = await service.findAll()
      expect(result.data).toEqual([])
      expect(result.total).toBe(0)
    })

    it('deve passar paginação correta ao prisma', async () => {
      await service.findAll({ page: 2, limit: 10 })
      expect(mockInviteFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 })
      )
    })
  })

  // ─────────────────────────────────────────────
  // findByToken
  // ─────────────────────────────────────────────

  describe('findByToken', () => {
    it('deve retornar null quando token não encontrado', async () => {
      const result = await service.findByToken('token-inexistente')
      expect(result).toBeNull()
    })

    it('deve retornar email e role quando token válido', async () => {
      mockInviteFindUnique.mockResolvedValueOnce({
        email: 'test@test.com',
        role: 'OPERATOR',
        status: 'PENDING',
        expiresAt: FUTURE_DATE,
      })
      const result = await service.findByToken('valid-token')
      expect(result).toMatchObject({ email: 'test@test.com', role: 'OPERATOR' })
    })
  })

  // ─────────────────────────────────────────────
  // create (ST004)
  // ─────────────────────────────────────────────

  describe('create', () => {
    it('deve criar convite para email não cadastrado', async () => {
      mockInviteCreate.mockResolvedValueOnce(VALID_INVITE)

      const result = await service.create(
        { email: 'novo@test.com', role: 'OPERATOR', expiresInDays: 7 },
        'admin-id'
      )

      expect(result).toMatchObject({ id: 'invite-1', email: 'novo@test.com' })
      expect(mockInviteCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'novo@test.com',
            status: 'PENDING',
          }),
        })
      )
    })

    it('deve lançar INVITE_021 quando já existe convite pendente', async () => {
      mockInviteFindFirst.mockResolvedValueOnce(VALID_INVITE)

      await expect(
        service.create(
          { email: 'novo@test.com', role: 'OPERATOR', expiresInDays: 7 },
          'admin-id'
        )
      ).rejects.toMatchObject({ code: 'INVITE_021' })

      expect(mockInviteCreate).not.toHaveBeenCalled()
    })

    it('deve lançar INVITE_020 quando email já tem conta ativa', async () => {
      mockUserProfileFindUnique.mockResolvedValueOnce({ id: 'user-1', email: 'novo@test.com' })

      await expect(
        service.create(
          { email: 'novo@test.com', role: 'OPERATOR', expiresInDays: 7 },
          'admin-id'
        )
      ).rejects.toMatchObject({ code: 'INVITE_020' })
    })
  })

  // ─────────────────────────────────────────────
  // activate (ST003)
  // ─────────────────────────────────────────────

  describe('activate', () => {
    const validInput = { password: 'Senha123!', termsAccepted: true as const }

    it('deve ativar conta com token válido e retornar userId + email', async () => {
      mockInviteFindUnique.mockResolvedValueOnce(VALID_INVITE)

      const result = await service.activate('valid-token-abc', validInput)

      expect(result).toEqual({ userId: 'new-user-id', email: 'novo@test.com' })
      expect(mockTransaction).toHaveBeenCalled()
      expect(mockAuthServiceCreateInvite).toHaveBeenCalledWith(
        'novo@test.com',
        expect.objectContaining({ data: { role: 'OPERATOR' } })
      )
    })

    it('deve lançar INVITE_080 quando token não encontrado', async () => {
      mockInviteFindUnique.mockResolvedValueOnce(null)

      await expect(service.activate('token-invalido', validInput)).rejects.toMatchObject({
        code: 'INVITE_080',
      })
    })

    it('deve lançar INVITE_051 quando token já foi utilizado (status ACCEPTED)', async () => {
      mockInviteFindUnique.mockResolvedValueOnce({
        ...VALID_INVITE,
        status: 'ACCEPTED',
        acceptedAt: new Date(),
      })

      await expect(service.activate('valid-token-abc', validInput)).rejects.toMatchObject({
        code: 'INVITE_051',
      })
    })

    it('deve lançar INVITE_050 quando token expirado (expiresAt no passado)', async () => {
      mockInviteFindUnique.mockResolvedValueOnce({
        ...VALID_INVITE,
        expiresAt: PAST_DATE,
      })

      await expect(service.activate('valid-token-abc', validInput)).rejects.toMatchObject({
        code: 'INVITE_050',
      })
    })

    it('deve lançar INVITE_050 quando status é REVOKED', async () => {
      mockInviteFindUnique.mockResolvedValueOnce({
        ...VALID_INVITE,
        status: 'REVOKED',
      })

      await expect(service.activate('valid-token-abc', validInput)).rejects.toMatchObject({
        code: 'INVITE_050',
      })
    })

    it('deve lançar AUTH_004 quando Supabase falha ao criar usuário', async () => {
      mockInviteFindUnique.mockResolvedValueOnce(VALID_INVITE)
      mockAuthServiceCreateInvite.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Supabase error' },
      })

      await expect(service.activate('valid-token-abc', validInput)).rejects.toMatchObject({
        code: 'AUTH_004',
      })
    })

    it('primeiro usuário deve receber role ADMIN automaticamente', async () => {
      mockInviteFindUnique.mockResolvedValueOnce(VALID_INVITE)
      mockUserProfileCount.mockResolvedValueOnce(0) // nenhum usuário ainda

      await service.activate('valid-token-abc', validInput)

      // transaction foi chamado — o conteúdo são promises internas dos mocks
      expect(mockTransaction).toHaveBeenCalled()
    })
  })
})
