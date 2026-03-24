/**
 * prisma/seed/test.ts
 *
 * Seed de testes — dados determinísticos para asserções em testes automatizados.
 * Todos os 8 LeadStatus, 2 CollectionJobStatus críticos, 3 InviteStatus testáveis.
 * IDs fixos nunca mudam — testes podem referenciar diretamente.
 *
 * Execução: bun run seed:test | npx tsx prisma/seed/test.ts
 */

import 'dotenv/config'
import {
  PrismaClient,
  UserRole,
  LeadStatus,
  LeadTemperature,
  CollectionJobStatus,
  DataSource,
  InviteStatus,
} from '@prisma/client'

// Workaround: NEGOTIATING e DISQUALIFIED estão no schema.prisma mas o @prisma/client
// ainda não foi regerado. Executar `npx prisma generate` para resolver os tipos.
const STATUS_NEGOTIATING  = 'NEGOTIATING'  as unknown as LeadStatus
const STATUS_DISQUALIFIED = 'DISQUALIFIED' as unknown as LeadStatus
import { seedScoringRules } from './scoring-rules'

const prisma = new PrismaClient()

// ─── UUIDs fixos para testes ──────────────────────────────────────────────────
// Prefixo 0x10+ para não colidir com dev seed (0x01+)

export const TEST_IDS = {
  // Usuários
  ADMIN:    '00000000-0000-0000-0000-000000000010',
  OPERATOR: '00000000-0000-0000-0000-000000000011',

  // CollectionJobs
  JOB_COMPLETED: '00000000-0000-0000-0000-000000000020',
  JOB_FAILED:    '00000000-0000-0000-0000-000000000021',

  // Invites
  INVITE_PENDING:  '00000000-0000-0000-0000-000000000040',
  INVITE_EXPIRED:  '00000000-0000-0000-0000-000000000041',
  INVITE_REVOKED:  '00000000-0000-0000-0000-000000000042',

  // Leads — todos os 8 status com scores conhecidos para asserções
  LEAD_NEW:                '00000000-0000-0000-0000-000000000030',
  LEAD_CONTACTED:          '00000000-0000-0000-0000-000000000031',
  LEAD_NEGOTIATING:        '00000000-0000-0000-0000-000000000032',
  LEAD_CONVERTED:          '00000000-0000-0000-0000-000000000033',
  LEAD_DISCARDED:          '00000000-0000-0000-0000-000000000034',
  LEAD_DISQUALIFIED:       '00000000-0000-0000-0000-000000000035',
  LEAD_FALSE_POSITIVE:     '00000000-0000-0000-0000-000000000036',
  LEAD_ENRICHMENT_PENDING: '00000000-0000-0000-0000-000000000037',
} as const

const now         = new Date()
const daysAgo     = (n: number) => new Date(now.getTime() - n * 86_400_000)
const daysFromNow = (n: number) => new Date(now.getTime() + n * 86_400_000)

async function main() {
  // ── ScoringRules ────────────────────────────────────────────────────────────
  await seedScoringRules(prisma)

  // ── Usuários ────────────────────────────────────────────────────────────────
  const admin = await prisma.userProfile.upsert({
    where: { email: 'admin@test.local' },
    update: {},
    create: {
      id: TEST_IDS.ADMIN,
      email: 'admin@test.local',
      name: 'Admin Test',
      role: UserRole.ADMIN,
      termsAcceptedAt: daysAgo(30),
      onboardingCompletedAt: daysAgo(30),
    },
  })

  await prisma.userProfile.upsert({
    where: { email: 'operator@test.local' },
    update: {},
    create: {
      id: TEST_IDS.OPERATOR,
      email: 'operator@test.local',
      name: 'Operador Test',
      role: UserRole.OPERATOR,
      termsAcceptedAt: daysAgo(15),
      onboardingCompletedAt: daysAgo(15),
    },
  })

  // ── CollectionJobs ──────────────────────────────────────────────────────────
  const completedJob = await prisma.collectionJob.upsert({
    where: { id: TEST_IDS.JOB_COMPLETED },
    update: {},
    create: {
      id: TEST_IDS.JOB_COMPLETED,
      userId: TEST_IDS.ADMIN,
      name: 'Test Job — Completed',
      status: CollectionJobStatus.COMPLETED,
      city: 'São Paulo',
      state: 'SP',
      niche: 'restaurante',
      sources: [DataSource.GOOGLE_MAPS],
      limitVal: 50,
      totalEstimated: 45,
      processedLeads: 45,
      resultCount: 40,
      progress: 100,
      startedAt: daysAgo(2),
      completedAt: daysAgo(2),
    },
  })

  await prisma.collectionJob.upsert({
    where: { id: TEST_IDS.JOB_FAILED },
    update: {},
    create: {
      id: TEST_IDS.JOB_FAILED,
      userId: TEST_IDS.ADMIN,
      name: 'Test Job — Failed',
      status: CollectionJobStatus.FAILED,
      city: 'São Paulo',
      state: 'SP',
      niche: 'academia',
      sources: [DataSource.GOOGLE_MAPS],
      errorMessage: 'API quota exceeded',
      startedAt: daysAgo(1),
      completedAt: daysAgo(1),
    },
  })

  // ── Invites ─────────────────────────────────────────────────────────────────
  await prisma.invite.upsert({
    where: { id: TEST_IDS.INVITE_PENDING },
    update: {},
    create: {
      id: TEST_IDS.INVITE_PENDING,
      email: 'pending@test.local',
      role: UserRole.OPERATOR,
      status: InviteStatus.PENDING,
      token: 'test-token-pending-abc123',
      invitedById: TEST_IDS.ADMIN,
      expiresAt: daysFromNow(7),
    },
  })

  // US-002 [ERROR]: token expirado
  await prisma.invite.upsert({
    where: { id: TEST_IDS.INVITE_EXPIRED },
    update: {},
    create: {
      id: TEST_IDS.INVITE_EXPIRED,
      email: 'expired@test.local',
      role: UserRole.OPERATOR,
      status: InviteStatus.EXPIRED,
      token: 'test-token-expired-def456',
      invitedById: TEST_IDS.ADMIN,
      expiresAt: daysAgo(8),
    },
  })

  await prisma.invite.upsert({
    where: { id: TEST_IDS.INVITE_REVOKED },
    update: {},
    create: {
      id: TEST_IDS.INVITE_REVOKED,
      email: 'revoked@test.local',
      role: UserRole.OPERATOR,
      status: InviteStatus.REVOKED,
      token: 'test-token-revoked-ghi789',
      invitedById: TEST_IDS.ADMIN,
      expiresAt: daysAgo(3),
    },
  })

  // ── Leads — todos os 8 status, scores determinísticos para asserções ────────
  const leadDefs: Array<{
    id: string
    businessName: string
    score: number
    status: LeadStatus
    temperature: LeadTemperature
    contactedAt?: Date
    falsePositiveReason?: string
  }> = [
    {
      id: TEST_IDS.LEAD_NEW,
      businessName: 'Restaurante Sem Site',
      score: 85,
      status: LeadStatus.NEW,
      temperature: LeadTemperature.WARM,
    },
    {
      id: TEST_IDS.LEAD_CONTACTED,
      businessName: 'Padaria Contato Feito',
      score: 72,
      status: LeadStatus.CONTACTED,
      temperature: LeadTemperature.WARM,
      contactedAt: daysAgo(3),
    },
    {
      id: TEST_IDS.LEAD_NEGOTIATING,
      businessName: 'Academia em Negociação',
      score: 91,
      status: STATUS_NEGOTIATING,
      temperature: LeadTemperature.HOT,
      contactedAt: daysAgo(10),
    },
    {
      id: TEST_IDS.LEAD_CONVERTED,
      businessName: 'Loja Convertida',
      score: 95,
      status: LeadStatus.CONVERTED,
      temperature: LeadTemperature.HOT,
      contactedAt: daysAgo(20),
    },
    {
      id: TEST_IDS.LEAD_DISCARDED,
      businessName: 'Bar Descartado',
      score: 10,
      status: LeadStatus.DISCARDED,
      temperature: LeadTemperature.COLD,
    },
    {
      id: TEST_IDS.LEAD_DISQUALIFIED,
      businessName: 'Empresa Desqualificada',
      score: 5,
      status: STATUS_DISQUALIFIED,
      temperature: LeadTemperature.COLD,
    },
    {
      id: TEST_IDS.LEAD_FALSE_POSITIVE,
      businessName: 'Grande Rede Hospitalar',
      score: 15,
      status: LeadStatus.FALSE_POSITIVE,
      temperature: LeadTemperature.COLD,
      falsePositiveReason: 'Grande rede nacional — fora do perfil PME local',
    },
    {
      id: TEST_IDS.LEAD_ENRICHMENT_PENDING,
      businessName: 'Lead Aguardando Enriquecimento',
      score: 0,
      status: LeadStatus.ENRICHMENT_PENDING,
      temperature: LeadTemperature.COLD,
    },
  ]

  for (const lead of leadDefs) {
    await prisma.lead.upsert({
      where: { id: lead.id },
      update: {},
      create: {
        ...lead,
        userId: TEST_IDS.ADMIN,
        jobId: completedJob.id,
        city: 'São Paulo',
        state: 'SP',
      },
    })
  }

  console.log('✅ Test seed concluído:', {
    admin: admin.email,
    jobs: 2,
    invites: 3,
    leads: leadDefs.length,
  })
}

main()
  .catch((e) => {
    console.error('❌ Erro no test seed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
