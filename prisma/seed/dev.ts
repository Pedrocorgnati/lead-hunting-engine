/**
 * prisma/seed/dev.ts
 *
 * Seed completo de desenvolvimento.
 * Cobre todos os valores de enum, edge cases de USER-STORIES e estados de erro do ERROR-CATALOG.
 *
 * Execução: bun run seed:dev | npx tsx prisma/seed/dev.ts
 * Reset:    npx prisma migrate reset --force  (aplica migrations + seed automaticamente)
 *
 * Invariante: dados são idempotentes via upsert — executar N vezes não duplica registros.
 */

import 'dotenv/config'
import {
  PrismaClient,
  UserRole,
  InviteStatus,
  CollectionJobStatus,
  DataSource,
  EnrichmentStatus,
  LeadStatus,
  LeadTemperature,
  OpportunityType,
} from '@prisma/client'

// Workaround: NEGOTIATING e DISQUALIFIED estão no schema.prisma mas o @prisma/client
// ainda não foi regerado. Executar `npx prisma generate` para resolver os tipos.
const STATUS_NEGOTIATING  = 'NEGOTIATING'  as unknown as LeadStatus
const STATUS_DISQUALIFIED = 'DISQUALIFIED' as unknown as LeadStatus
import { seedScoringRules } from './scoring-rules'
import { seedRegionsAndNiches } from './regions-niches'

const prisma = new PrismaClient()

// ─── UUIDs fixos (anchor records) ─────────────────────────────────────────────
// Alterar esses valores QUEBRA testes e docs que referenciam esses IDs.

// Usuários
const ADMIN_ID     = '00000000-0000-0000-0000-000000000001'
const OPERATOR_ID  = '00000000-0000-0000-0000-000000000002'
const OPERATOR2_ID = '00000000-0000-0000-0000-000000000003' // sem onboarding (US-010 edge case)
const DELETION_ID  = '00000000-0000-0000-0000-000000000004' // deletion_requested (USER_050)

// Invites — cobre todos os 4 InviteStatus
const INVITE_PENDING  = '00000000-0000-0000-0000-0000000000c1'
const INVITE_ACCEPTED = '00000000-0000-0000-0000-0000000000c2'
const INVITE_EXPIRED  = '00000000-0000-0000-0000-0000000000c3' // US-002 [ERROR]
const INVITE_REVOKED  = '00000000-0000-0000-0000-0000000000c4'

// CollectionJobs — cobre todos os 7 CollectionJobStatus
const JOB_PENDING   = '00000000-0000-0000-0000-0000000000a1'
const JOB_RUNNING   = '00000000-0000-0000-0000-0000000000a2'
const JOB_COMPLETED = '00000000-0000-0000-0000-0000000000a3'
const JOB_FAILED    = '00000000-0000-0000-0000-0000000000a4' // JOB_001 error state
const JOB_PAUSED    = '00000000-0000-0000-0000-0000000000a5'
const JOB_PARTIAL   = '00000000-0000-0000-0000-0000000000a6'
const JOB_CANCELLED = '00000000-0000-0000-0000-0000000000a7'

// RawLeadData — cobre todos os 3 EnrichmentStatus
const RAW_PENDING  = '00000000-0000-0000-0000-0000000000d1'
const RAW_COMPLETE = '00000000-0000-0000-0000-0000000000d2'
const RAW_PARTIAL  = '00000000-0000-0000-0000-0000000000d3'

// Leads — cobre todos os 8 LeadStatus
const LEAD_NEW                = '00000000-0000-0000-0000-0000000000b1'
const LEAD_CONTACTED          = '00000000-0000-0000-0000-0000000000b2'
const LEAD_NEGOTIATING        = '00000000-0000-0000-0000-0000000000b3'
const LEAD_CONVERTED          = '00000000-0000-0000-0000-0000000000b4'
const LEAD_DISCARDED          = '00000000-0000-0000-0000-0000000000b5'
const LEAD_DISQUALIFIED       = '00000000-0000-0000-0000-0000000000b6'
const LEAD_FALSE_POSITIVE     = '00000000-0000-0000-0000-0000000000b7'
const LEAD_ENRICHMENT_PENDING = '00000000-0000-0000-0000-0000000000b8'

// PitchTemplates
const PITCH_FORMAL      = '00000000-0000-0000-0000-0000000000e1'
const PITCH_CASUAL_FAV  = '00000000-0000-0000-0000-0000000000e2'
const PITCH_OPERATOR    = '00000000-0000-0000-0000-0000000000e3'

// DataProvenance
const PROV_PHONE   = '00000000-0000-0000-0000-0000000000f1'
const PROV_WEBSITE = '00000000-0000-0000-0000-0000000000f2'

// ─── Helpers de data ──────────────────────────────────────────────────────────
const now          = new Date()
const daysAgo      = (n: number) => new Date(now.getTime() - n * 86_400_000)
const daysFromNow  = (n: number) => new Date(now.getTime() + n * 86_400_000)

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Dev seed iniciando...\n')

  // =========================================================================
  // NIVEL 0 — ScoringRules + ApiCredentials
  // =========================================================================

  await seedScoringRules(prisma)
  await seedRegionsAndNiches(prisma)

  // ApiCredential — ativa (google_places)
  await prisma.apiCredential.upsert({
    where: { provider: 'google_places' },
    update: {},
    create: {
      provider: 'google_places',
      encryptedKey: 'ENCRYPTED_DEV_KEY_PLACEHOLDER',
      iv: 'DEV_IV_PLACEHOLDER_0001',
      isActive: true,
      usageCount: 142,
      usageResetAt: daysFromNow(7),
    },
  })

  // ApiCredential — inativa (edge case: chave desabilitada)
  await prisma.apiCredential.upsert({
    where: { provider: 'outscraper' },
    update: {},
    create: {
      provider: 'outscraper',
      encryptedKey: 'ENCRYPTED_DEV_KEY_PLACEHOLDER',
      iv: 'DEV_IV_PLACEHOLDER_0002',
      isActive: false,
      usageCount: 0,
    },
  })

  // ApiCredential — LLM ativa (openai)
  await prisma.apiCredential.upsert({
    where: { provider: 'openai' },
    update: {},
    create: {
      provider: 'openai',
      encryptedKey: 'ENCRYPTED_DEV_KEY_PLACEHOLDER',
      iv: 'DEV_IV_PLACEHOLDER_0003',
      isActive: true,
      usageCount: 38,
    },
  })

  console.log('  ✓ ScoringRules + ApiCredentials (3)')

  // =========================================================================
  // NIVEL 0 — UserProfiles
  // =========================================================================

  // ADMIN — onboarding completo
  const admin = await prisma.userProfile.upsert({
    where: { email: 'admin@dev.local' },
    update: {},
    create: {
      id: ADMIN_ID,
      email: 'admin@dev.local',
      name: 'Pedro Admin',
      role: UserRole.ADMIN,
      termsAcceptedAt: daysAgo(30),
      onboardingCompletedAt: daysAgo(30),
      avatarUrl: 'https://picsum.photos/seed/admin-dev/80/80',
    },
  })

  // OPERATOR — onboarding completo
  await prisma.userProfile.upsert({
    where: { email: 'operador@dev.local' },
    update: {},
    create: {
      id: OPERATOR_ID,
      email: 'operador@dev.local',
      name: 'Carlos Operador',
      role: UserRole.OPERATOR,
      termsAcceptedAt: daysAgo(15),
      onboardingCompletedAt: daysAgo(15),
    },
  })

  // OPERATOR — sem onboarding (US-010 edge case: primeiro acesso sem completar onboarding)
  await prisma.userProfile.upsert({
    where: { email: 'novato@dev.local' },
    update: {},
    create: {
      id: OPERATOR2_ID,
      email: 'novato@dev.local',
      name: 'Fernanda Novata',
      role: UserRole.OPERATOR,
      termsAcceptedAt: daysAgo(1),
      onboardingCompletedAt: null,
    },
  })

  // OPERATOR — deletion_requested (USER_050 error state)
  await prisma.userProfile.upsert({
    where: { email: 'saindo@dev.local' },
    update: {},
    create: {
      id: DELETION_ID,
      email: 'saindo@dev.local',
      name: 'João Saindo',
      role: UserRole.OPERATOR,
      termsAcceptedAt: daysAgo(90),
      onboardingCompletedAt: daysAgo(90),
      deletionRequestedAt: daysAgo(2),
    },
  })

  console.log('  ✓ UserProfiles (4): ADMIN, OPERATOR, sem-onboarding, deletion-requested')

  // =========================================================================
  // NIVEL 1 — Invites (cobre todos os 4 InviteStatus)
  // =========================================================================

  // PENDING — convite ainda válido
  await prisma.invite.upsert({
    where: { id: INVITE_PENDING },
    update: {},
    create: {
      id: INVITE_PENDING,
      email: 'novo.operador@exemplo.com.br',
      role: UserRole.OPERATOR,
      status: InviteStatus.PENDING,
      token: 'dev-token-pending-00000001',
      invitedById: ADMIN_ID,
      expiresAt: daysFromNow(7),
    },
  })

  // ACCEPTED — convite aceito (email coincide com operador cadastrado)
  await prisma.invite.upsert({
    where: { id: INVITE_ACCEPTED },
    update: {},
    create: {
      id: INVITE_ACCEPTED,
      email: 'operador@dev.local',
      role: UserRole.OPERATOR,
      status: InviteStatus.ACCEPTED,
      token: 'dev-token-accepted-00000002',
      invitedById: ADMIN_ID,
      expiresAt: daysAgo(5),
      acceptedAt: daysAgo(10),
    },
  })

  // EXPIRED — US-002 [ERROR]: "Este convite expirou."
  await prisma.invite.upsert({
    where: { id: INVITE_EXPIRED },
    update: {},
    create: {
      id: INVITE_EXPIRED,
      email: 'expirado@exemplo.com.br',
      role: UserRole.OPERATOR,
      status: InviteStatus.EXPIRED,
      token: 'dev-token-expired-00000003',
      invitedById: ADMIN_ID,
      expiresAt: daysAgo(8),
    },
  })

  // REVOKED — convite revogado pelo admin
  await prisma.invite.upsert({
    where: { id: INVITE_REVOKED },
    update: {},
    create: {
      id: INVITE_REVOKED,
      email: 'revogado@exemplo.com.br',
      role: UserRole.OPERATOR,
      status: InviteStatus.REVOKED,
      token: 'dev-token-revoked-00000004',
      invitedById: ADMIN_ID,
      expiresAt: daysAgo(3),
    },
  })

  console.log('  ✓ Invites (4): PENDING, ACCEPTED, EXPIRED, REVOKED')

  // =========================================================================
  // NIVEL 1 — CollectionJobs (cobre todos os 7 CollectionJobStatus)
  // =========================================================================

  // PENDING — ainda não iniciado
  await prisma.collectionJob.upsert({
    where: { id: JOB_PENDING },
    update: {},
    create: {
      id: JOB_PENDING,
      userId: ADMIN_ID,
      name: 'Restaurantes SP — Pendente',
      status: CollectionJobStatus.PENDING,
      city: 'São Paulo',
      state: 'SP',
      country: 'BR',
      niche: 'restaurante',
      sources: [DataSource.GOOGLE_MAPS],
      limitVal: 100,
    },
  })

  // RUNNING — em execução com progresso parcial
  await prisma.collectionJob.upsert({
    where: { id: JOB_RUNNING },
    update: {},
    create: {
      id: JOB_RUNNING,
      userId: ADMIN_ID,
      name: 'Salões de Beleza RJ — Rodando',
      status: CollectionJobStatus.RUNNING,
      city: 'Rio de Janeiro',
      state: 'RJ',
      country: 'BR',
      niche: 'salão de beleza',
      sources: [DataSource.GOOGLE_MAPS, DataSource.INSTAGRAM],
      limitVal: 200,
      totalEstimated: 200,
      processedLeads: 87,
      resultCount: 71,
      progress: 43,
      currentSource: 'INSTAGRAM',
      startedAt: daysAgo(0),
    },
  })

  // COMPLETED — concluído com sucesso
  await prisma.collectionJob.upsert({
    where: { id: JOB_COMPLETED },
    update: {},
    create: {
      id: JOB_COMPLETED,
      userId: ADMIN_ID,
      name: 'Clínicas BH — Concluído',
      status: CollectionJobStatus.COMPLETED,
      city: 'Belo Horizonte',
      state: 'MG',
      country: 'BR',
      niche: 'clínica médica',
      sources: [DataSource.GOOGLE_MAPS, DataSource.WEBSITE],
      limitVal: 150,
      totalEstimated: 140,
      processedLeads: 140,
      resultCount: 118,
      progress: 100,
      startedAt: daysAgo(3),
      completedAt: daysAgo(3),
    },
  })

  // FAILED — JOB_001 error state: quota da API esgotada
  await prisma.collectionJob.upsert({
    where: { id: JOB_FAILED },
    update: {},
    create: {
      id: JOB_FAILED,
      userId: OPERATOR_ID,
      name: 'Academias Porto Alegre — Falhou',
      status: CollectionJobStatus.FAILED,
      city: 'Porto Alegre',
      state: 'RS',
      country: 'BR',
      niche: 'academia',
      sources: [DataSource.GOOGLE_MAPS],
      limitVal: 50,
      processedLeads: 12,
      resultCount: 10,
      progress: 24,
      errorMessage: 'Quota da API do Google Places esgotada. Tente novamente amanhã.',
      errorLog: {
        code: 'QUOTA_EXCEEDED',
        service: 'google_places',
        ts: daysAgo(1).toISOString(),
      },
      startedAt: daysAgo(1),
      completedAt: daysAgo(1),
    },
  })

  // PAUSED — pausado pelo operador manualmente
  await prisma.collectionJob.upsert({
    where: { id: JOB_PAUSED },
    update: {},
    create: {
      id: JOB_PAUSED,
      userId: OPERATOR_ID,
      name: 'Bares Curitiba — Pausado',
      status: CollectionJobStatus.PAUSED,
      city: 'Curitiba',
      state: 'PR',
      country: 'BR',
      niche: 'bar',
      sources: [DataSource.GOOGLE_MAPS, DataSource.YELP],
      limitVal: 80,
      processedLeads: 35,
      resultCount: 28,
      progress: 44,
      startedAt: daysAgo(2),
    },
  })

  // PARTIAL — concluído com erros em parte das fontes
  await prisma.collectionJob.upsert({
    where: { id: JOB_PARTIAL },
    update: {},
    create: {
      id: JOB_PARTIAL,
      userId: ADMIN_ID,
      name: 'Farmácias Salvador — Parcial',
      status: CollectionJobStatus.PARTIAL,
      city: 'Salvador',
      state: 'BA',
      country: 'BR',
      niche: 'farmácia',
      sources: [DataSource.GOOGLE_MAPS, DataSource.APONTADOR],
      limitVal: 120,
      processedLeads: 120,
      resultCount: 78,
      progress: 100,
      errorMessage: 'Fonte APONTADOR retornou dados incompletos para 42 registros.',
      startedAt: daysAgo(5),
      completedAt: daysAgo(5),
    },
  })

  // CANCELLED — cancelado pelo usuário antes de concluir
  await prisma.collectionJob.upsert({
    where: { id: JOB_CANCELLED },
    update: {},
    create: {
      id: JOB_CANCELLED,
      userId: OPERATOR_ID,
      name: 'Pet Shops Fortaleza — Cancelado',
      status: CollectionJobStatus.CANCELLED,
      city: 'Fortaleza',
      state: 'CE',
      country: 'BR',
      niche: 'pet shop',
      sources: [DataSource.GOOGLE_MAPS],
      limitVal: 60,
      processedLeads: 5,
      resultCount: 4,
      progress: 8,
      startedAt: daysAgo(1),
    },
  })

  console.log('  ✓ CollectionJobs (7): PENDING, RUNNING, COMPLETED, FAILED, PAUSED, PARTIAL, CANCELLED')

  // =========================================================================
  // NIVEL 1 — PitchTemplates
  // =========================================================================

  // Formal — não favorito
  await prisma.pitchTemplate.upsert({
    where: { id: PITCH_FORMAL },
    update: {},
    create: {
      id: PITCH_FORMAL,
      userId: ADMIN_ID,
      name: 'Proposta Site Institucional',
      tone: 'formal',
      isFavorite: false,
      content: [
        'Olá, {nome_empresa}!',
        '',
        'Identificamos que seu negócio ainda não possui um site institucional moderno.',
        'Desenvolvemos sites profissionais, responsivos e com alta performance para empresas como a sua.',
        '',
        'Nossos diferenciais:',
        '• Design personalizado',
        '• Otimização para Google (SEO)',
        '• Carregamento em menos de 2 segundos',
        '• Suporte por 12 meses',
        '',
        'Podemos agendar uma conversa de 15 minutos para apresentar nossa proposta?',
      ].join('\n'),
    },
  })

  // Casual — favorito (isFavorite: true)
  await prisma.pitchTemplate.upsert({
    where: { id: PITCH_CASUAL_FAV },
    update: {},
    create: {
      id: PITCH_CASUAL_FAV,
      userId: ADMIN_ID,
      name: 'WhatsApp Direto — Casual',
      tone: 'casual',
      isFavorite: true,
      content: [
        'Oi, {nome}! Tudo bem?',
        '',
        'Vi que vocês são muito bem avaliados no Google — parabéns!',
        '',
        'Sou especialista em criar sites e sistemas para negócios locais.',
        'Analisei o perfil de vocês e identifiquei algumas oportunidades que podem trazer mais clientes pela internet.',
        '',
        'Tem 10 minutinhos para bater um papo?',
      ].join('\n'),
    },
  })

  // Template do operador — automação
  await prisma.pitchTemplate.upsert({
    where: { id: PITCH_OPERATOR },
    update: {},
    create: {
      id: PITCH_OPERATOR,
      userId: OPERATOR_ID,
      name: 'Automação para Comércio',
      tone: 'formal',
      isFavorite: false,
      content: [
        'Prezado(a) {nome_empresa},',
        '',
        'Observamos que seu estabelecimento utiliza processos manuais para {processo}.',
        'Desenvolvemos soluções de automação que reduzem o trabalho manual em até 70%.',
        '',
        'Entramos em contato para apresentar um diagnóstico gratuito.',
      ].join('\n'),
    },
  })

  console.log('  ✓ PitchTemplates (3): formal, casual-favorito, automação-operator')

  // =========================================================================
  // NIVEL 2 — RawLeadData (cobre todos os 3 EnrichmentStatus)
  // =========================================================================

  // PENDING — coletado mas ainda não enriquecido
  await prisma.rawLeadData.upsert({
    where: { id: RAW_PENDING },
    update: {},
    create: {
      id: RAW_PENDING,
      externalId: 'gmaps-dev-ChIJN1t_tDeuEms',
      jobId: JOB_COMPLETED,
      userId: ADMIN_ID,
      source: DataSource.GOOGLE_MAPS,
      sourceUrl: 'https://maps.google.com/?cid=11111111',
      businessName: 'Clínica São Lucas',
      phone: '(31) 3333-4444',
      phoneNormalized: '5531333344444',
      address: 'Rua das Flores, 123, Savassi',
      city: 'Belo Horizonte',
      state: 'MG',
      lat: -19.9166,
      lng: -43.9344,
      category: 'Clínica médica',
      rating: 4.2,
      reviewCount: 312,
      openNow: true,
      priceLevel: 2,
      enrichmentStatus: EnrichmentStatus.PENDING,
      rawJson: {
        place_id: 'ChIJN1t_tDeuEms',
        types: ['health', 'establishment'],
      },
    },
  })

  // COMPLETE — coletado e totalmente enriquecido
  await prisma.rawLeadData.upsert({
    where: { id: RAW_COMPLETE },
    update: {},
    create: {
      id: RAW_COMPLETE,
      externalId: 'gmaps-dev-ChIJN2t_tDeuEms',
      jobId: JOB_COMPLETED,
      userId: ADMIN_ID,
      source: DataSource.GOOGLE_MAPS,
      sourceUrl: 'https://maps.google.com/?cid=22222222',
      businessName: 'Clínica Bem Estar',
      phone: '(31) 3444-5555',
      phoneNormalized: '5531344455555',
      address: 'Av. do Contorno, 456, Centro',
      city: 'Belo Horizonte',
      state: 'MG',
      lat: -19.9210,
      lng: -43.9380,
      website: 'https://clinicabemestar.com.br',
      category: 'Clínica médica',
      rating: 4.8,
      reviewCount: 892,
      openNow: false,
      siteReachable: true,
      siteHasSsl: true,
      siteTitle: 'Clínica Bem Estar — Cuidando de você',
      siteMobileFriendly: false,
      instagramHandle: 'clinicabemestar_bh',
      instagramFollowers: 15200,
      enrichmentStatus: EnrichmentStatus.COMPLETE,
      enrichmentData: {
        enrichedAt: daysAgo(2).toISOString(),
        websiteScore: 45,
        socialScore: 85,
      },
      rawJson: {
        place_id: 'ChIJN2t_tDeuEms',
        types: ['health', 'establishment'],
      },
    },
  })

  // PARTIAL — enriquecimento parcial (timeout no site)
  await prisma.rawLeadData.upsert({
    where: { id: RAW_PARTIAL },
    update: {},
    create: {
      id: RAW_PARTIAL,
      externalId: 'apontador-dev-fa123456',
      jobId: JOB_PARTIAL,
      userId: ADMIN_ID,
      source: DataSource.APONTADOR,
      sourceUrl: 'https://apontador.com.br/place/farmacia-central',
      businessName: 'Farmácia Central',
      phone: '(71) 3222-1111',
      phoneNormalized: '5571322211111',
      city: 'Salvador',
      state: 'BA',
      category: 'Farmácia',
      enrichmentStatus: EnrichmentStatus.PARTIAL,
      enrichmentData: {
        enrichedAt: daysAgo(4).toISOString(),
        websiteScore: null,
        socialScore: 30,
        partialReason: 'site_timeout',
      },
    },
  })

  console.log('  ✓ RawLeadData (3): PENDING, COMPLETE, PARTIAL')

  // =========================================================================
  // NIVEL 2 — Leads (cobre todos os 8 LeadStatus + 3 LeadTemperature + todos os OpportunityType)
  // =========================================================================

  // NEW + WARM + A_NEEDS_SITE
  await prisma.lead.upsert({
    where: { id: LEAD_NEW },
    update: {},
    create: {
      id: LEAD_NEW,
      userId: ADMIN_ID,
      jobId: JOB_COMPLETED,
      status: LeadStatus.NEW,
      businessName: 'Clínica São Lucas',
      phone: '(31) 3333-4444',
      phoneNormalized: '5531333344444',
      address: 'Rua das Flores, 123, Savassi',
      city: 'Belo Horizonte',
      state: 'MG',
      category: 'Clínica médica',
      rating: 4.2,
      reviewCount: 312,
      score: 75,
      temperature: LeadTemperature.WARM,
      opportunities: [OpportunityType.A_NEEDS_SITE],
      problems: ['Sem site institucional', 'Nenhuma presença digital'],
      suggestions: ['Criar site institucional com formulário de agendamento online'],
      scoreBreakdown: {
        website_presence: 0,
        social_presence: 20,
        reviews: 20,
        location: 15,
        digital_maturity: 10,
        digital_gap: 10,
      },
    },
  })

  // CONTACTED + HOT + B_NEEDS_SYSTEM + C_NEEDS_AUTOMATION
  await prisma.lead.upsert({
    where: { id: LEAD_CONTACTED },
    update: {},
    create: {
      id: LEAD_CONTACTED,
      userId: ADMIN_ID,
      jobId: JOB_COMPLETED,
      status: LeadStatus.CONTACTED,
      businessName: 'Clínica Bem Estar',
      phone: '(31) 3444-5555',
      phoneNormalized: '5531344455555',
      website: 'https://clinicabemestar.com.br',
      city: 'Belo Horizonte',
      state: 'MG',
      category: 'Clínica médica',
      instagramHandle: 'clinicabemestar_bh',
      instagramFollowers: 15200,
      rating: 4.8,
      reviewCount: 892,
      score: 88,
      temperature: LeadTemperature.HOT,
      opportunities: [OpportunityType.B_NEEDS_SYSTEM, OpportunityType.C_NEEDS_AUTOMATION],
      problems: ['Site sem responsividade mobile', 'Sem sistema de agendamento online'],
      suggestions: [
        'Sistema de agendamento integrado ao site',
        'Automação de lembretes de consulta por WhatsApp',
      ],
      contactedAt: daysAgo(2),
      pitchContent:
        'Oi! Vi que a Clínica Bem Estar é muito bem avaliada no Google. Identifiquei oportunidades de automação que podem reduzir faltas em 30%.',
      pitchTone: 'casual',
      notes: 'Falar com Dra. Ana — prefere WhatsApp depois das 18h',
      scoreBreakdown: {
        website_presence: 15,
        social_presence: 20,
        reviews: 20,
        location: 15,
        digital_maturity: 10,
        digital_gap: 8,
      },
    },
  })

  // NEGOTIATING + HOT + D_NEEDS_ECOMMERCE + E_SCALE
  await prisma.lead.upsert({
    where: { id: LEAD_NEGOTIATING },
    update: {},
    create: {
      id: LEAD_NEGOTIATING,
      userId: OPERATOR_ID,
      jobId: JOB_PARTIAL,
      status: STATUS_NEGOTIATING,
      businessName: 'Farmácia Central Salvador',
      phone: '(71) 3222-1111',
      phoneNormalized: '5571322211111',
      city: 'Salvador',
      state: 'BA',
      category: 'Farmácia',
      score: 92,
      temperature: LeadTemperature.HOT,
      opportunities: [OpportunityType.D_NEEDS_ECOMMERCE, OpportunityType.E_SCALE],
      problems: ['Sem e-commerce', 'Delivery manual via WhatsApp sem rastreamento'],
      suggestions: [
        'Loja virtual com delivery próprio',
        'Integração com iFood Farmácia e Rappi',
      ],
      contactedAt: daysAgo(10),
      notes: 'Dono interessado — pediu proposta formal até sexta-feira. Orçamento estimado R$ 12k.',
      scoreBreakdown: {
        website_presence: 10,
        social_presence: 18,
        reviews: 20,
        location: 15,
        digital_maturity: 15,
        digital_gap: 14,
      },
    },
  })

  // CONVERTED + HOT + E_SCALE — lead que virou cliente
  await prisma.lead.upsert({
    where: { id: LEAD_CONVERTED },
    update: {},
    create: {
      id: LEAD_CONVERTED,
      userId: ADMIN_ID,
      jobId: JOB_COMPLETED,
      status: LeadStatus.CONVERTED,
      businessName: 'Restaurante Família Unida',
      phone: '(31) 3111-2222',
      phoneNormalized: '5531311122222',
      website: 'https://restaurantefamiliaunida.com.br',
      city: 'Belo Horizonte',
      state: 'MG',
      category: 'Restaurante',
      rating: 4.6,
      reviewCount: 1240,
      score: 95,
      temperature: LeadTemperature.HOT,
      opportunities: [OpportunityType.E_SCALE],
      problems: ['Sistema legado sem integração delivery', 'Sem presença em apps'],
      suggestions: ['Novo sistema integrado', 'Onboarding iFood e Rappi'],
      contactedAt: daysAgo(20),
      notes: 'Fechou contrato em 15/03 — R$ 8.500,00. Início da execução: 01/04.',
      scoreBreakdown: {
        website_presence: 18,
        social_presence: 20,
        reviews: 20,
        location: 15,
        digital_maturity: 12,
        digital_gap: 10,
      },
    },
  })

  // DISCARDED + COLD — sem retorno após múltiplas tentativas
  await prisma.lead.upsert({
    where: { id: LEAD_DISCARDED },
    update: {},
    create: {
      id: LEAD_DISCARDED,
      userId: OPERATOR_ID,
      jobId: JOB_PAUSED,
      status: LeadStatus.DISCARDED,
      businessName: 'Bar do Zé',
      phone: '(41) 9999-0000',
      phoneNormalized: '5541999900000',
      city: 'Curitiba',
      state: 'PR',
      category: 'Bar',
      score: 12,
      temperature: LeadTemperature.COLD,
      problems: ['Não responde contatos'],
      notes: 'Tentei 3 vezes em 2 semanas — sem retorno. Descartado.',
    },
  })

  // DISQUALIFIED + COLD — estabelecimento encerrado
  await prisma.lead.upsert({
    where: { id: LEAD_DISQUALIFIED },
    update: {},
    create: {
      id: LEAD_DISQUALIFIED,
      userId: OPERATOR_ID,
      jobId: JOB_PAUSED,
      status: STATUS_DISQUALIFIED,
      businessName: 'Barzinho Fechado',
      city: 'Curitiba',
      state: 'PR',
      category: 'Bar',
      score: 5,
      temperature: LeadTemperature.COLD,
      problems: ['Estabelecimento encerrado permanentemente'],
      notes: 'Google Maps mostra como permanentemente fechado. Desqualificado.',
    },
  })

  // FALSE_POSITIVE + COLD — grande empresa, não é PME local
  await prisma.lead.upsert({
    where: { id: LEAD_FALSE_POSITIVE },
    update: {},
    create: {
      id: LEAD_FALSE_POSITIVE,
      userId: ADMIN_ID,
      jobId: JOB_COMPLETED,
      status: LeadStatus.FALSE_POSITIVE,
      businessName: 'Hospital Albert Einstein',
      website: 'https://einstein.br',
      city: 'Belo Horizonte',
      state: 'MG',
      category: 'Hospital',
      score: 20,
      temperature: LeadTemperature.COLD,
      falsePositiveReason: 'Grande rede hospitalar nacional — fora do perfil alvo (PME local)',
    },
  })

  // ENRICHMENT_PENDING + COLD — score zerado aguardando enriquecimento
  await prisma.lead.upsert({
    where: { id: LEAD_ENRICHMENT_PENDING },
    update: {},
    create: {
      id: LEAD_ENRICHMENT_PENDING,
      userId: ADMIN_ID,
      jobId: JOB_PARTIAL,
      status: LeadStatus.ENRICHMENT_PENDING,
      businessName: 'Farmácia Popular Bahia',
      phone: '(71) 3100-2000',
      phoneNormalized: '5571310020000',
      city: 'Salvador',
      state: 'BA',
      category: 'Farmácia',
      score: 0,
      temperature: LeadTemperature.COLD,
    },
  })

  console.log(
    '  ✓ Leads (8): NEW(WARM), CONTACTED(HOT), NEGOTIATING(HOT), CONVERTED(HOT), DISCARDED(COLD), DISQUALIFIED(COLD), FALSE_POSITIVE(COLD), ENRICHMENT_PENDING(COLD)'
  )

  // =========================================================================
  // NIVEL 3 — DataProvenance (para LEAD_CONTACTED — rastreabilidade de campos)
  // =========================================================================

  await prisma.dataProvenance.upsert({
    where: { id: PROV_PHONE },
    update: {},
    create: {
      id: PROV_PHONE,
      leadId: LEAD_CONTACTED,
      field: 'phone',
      source: DataSource.GOOGLE_MAPS,
      sourceUrl: 'https://maps.google.com/?cid=22222222',
      collectedAt: daysAgo(3),
      confidence: 0.98,
      rawLeadDataId: RAW_COMPLETE,
    },
  })

  await prisma.dataProvenance.upsert({
    where: { id: PROV_WEBSITE },
    update: {},
    create: {
      id: PROV_WEBSITE,
      leadId: LEAD_CONTACTED,
      field: 'website',
      source: DataSource.WEBSITE,
      sourceUrl: 'https://clinicabemestar.com.br',
      collectedAt: daysAgo(3),
      confidence: 1.0,
      rawLeadDataId: RAW_COMPLETE,
    },
  })

  console.log('  ✓ DataProvenance (2): phone, website → LEAD_CONTACTED')

  // =========================================================================
  // AuditLog — registros de rastreabilidade
  // =========================================================================

  await prisma.auditLog.createMany({
    skipDuplicates: true,
    data: [
      {
        userId: ADMIN_ID,
        action: 'invite.create',
        resource: 'invites',
        resourceId: INVITE_PENDING,
        metadata: { email: 'novo.operador@exemplo.com.br', role: 'OPERATOR' },
        ipAddress: '192.168.1.100',
        createdAt: daysAgo(5),
      },
      {
        userId: ADMIN_ID,
        action: 'job.create',
        resource: 'collection_jobs',
        resourceId: JOB_COMPLETED,
        metadata: {
          city: 'Belo Horizonte',
          niche: 'clínica médica',
          sources: ['GOOGLE_MAPS', 'WEBSITE'],
        },
        ipAddress: '192.168.1.100',
        createdAt: daysAgo(3),
      },
      {
        userId: OPERATOR_ID,
        action: 'lead.status_change',
        resource: 'leads',
        resourceId: LEAD_NEGOTIATING,
        metadata: { from: 'CONTACTED', to: 'NEGOTIATING' },
        ipAddress: '10.0.0.55',
        createdAt: daysAgo(7),
      },
      {
        userId: ADMIN_ID,
        action: 'config.credential_upsert',
        resource: 'api_credentials',
        metadata: { provider: 'google_places' },
        ipAddress: '192.168.1.100',
        createdAt: daysAgo(30),
      },
      {
        userId: DELETION_ID,
        action: 'user.request_deletion',
        resource: 'user_profiles',
        resourceId: DELETION_ID,
        metadata: { reason: 'Não preciso mais do sistema' },
        ipAddress: '10.0.0.88',
        createdAt: daysAgo(2),
      },
    ],
  })

  console.log('  ✓ AuditLogs (5)')

  // ─── Sumário ────────────────────────────────────────────────────────────────

  console.log('\n🎉 Dev seed concluído com sucesso!')
  console.log('   ScoringRules:     6  (website_presence, social_presence, reviews, location, digital_maturity, digital_gap)')
  console.log('   ApiCredentials:   3  (google_places ativo, outscraper inativo, openai ativo)')
  console.log('   UserProfiles:     4  (ADMIN, OPERATOR, sem-onboarding, deletion-requested)')
  console.log('   Invites:          4  (PENDING, ACCEPTED, EXPIRED, REVOKED)')
  console.log('   CollectionJobs:   7  (todos os status)')
  console.log('   PitchTemplates:   3  (formal, casual-fav, automação)')
  console.log('   RawLeadData:      3  (PENDING, COMPLETE, PARTIAL)')
  console.log('   Leads:            8  (todos os status × 3 temperatures × 5 opportunity types)')
  console.log('   DataProvenance:   2  (phone, website)')
  console.log('   AuditLogs:        5')
  console.log(`\n   Admin:    admin@dev.local (ID: ${ADMIN_ID})`)
  console.log(`   Operator: operador@dev.local (ID: ${OPERATOR_ID})`)
}

main()
  .catch((e) => {
    console.error('❌ Erro no dev seed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
