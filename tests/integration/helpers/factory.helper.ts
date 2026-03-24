/**
 * Factories de dados para testes de integração.
 *
 * Cada factory gera dados únicos por execução para evitar colisões entre testes.
 * Use os overrides para ajustar campos específicos quando necessário.
 *
 * IMPORTANTE: Os dados criados pelas factories devem ser limpos no afterEach
 * via db.helper.ts ou delete direto no Prisma.
 */

import type { DataSource } from '@prisma/client'

let counter = 0
function uid(): string {
  return `${Date.now()}-${++counter}`
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface SignInPayload {
  email: string
  password: string
}

export function buildSignInPayload(overrides: Partial<SignInPayload> = {}): SignInPayload {
  return {
    email: `user-${uid()}@test.local`,
    password: 'Test@Password123',
    ...overrides,
  }
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export interface UpdateProfilePayload {
  name?: string
  avatarUrl?: string | null
}

export function buildUpdateProfilePayload(
  overrides: Partial<UpdateProfilePayload> = {},
): UpdateProfilePayload {
  return {
    name: `Operador Teste ${uid()}`,
    ...overrides,
  }
}

// ─── Invites ──────────────────────────────────────────────────────────────────

export interface CreateInvitePayload {
  email: string
  role?: 'ADMIN' | 'OPERATOR'
  expiresInDays?: number
}

export function buildCreateInvitePayload(
  overrides: Partial<CreateInvitePayload> = {},
): CreateInvitePayload {
  return {
    email: `invite-${uid()}@test.local`,
    role: 'OPERATOR',
    expiresInDays: 7,
    ...overrides,
  }
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export interface CreateJobPayload {
  city: string
  state?: string
  niche: string
  sources: DataSource[]
  limit?: number
}

export function buildCreateJobPayload(
  overrides: Partial<CreateJobPayload> = {},
): CreateJobPayload {
  return {
    city: 'São Paulo',
    state: 'SP',
    niche: 'restaurantes',
    sources: ['GOOGLE_MAPS'],
    limit: 10,
    ...overrides,
  }
}

// ─── Leads ────────────────────────────────────────────────────────────────────

export interface UpdateLeadStatusPayload {
  status: string
}

export function buildUpdateLeadStatusPayload(
  status: string,
  overrides: Partial<UpdateLeadStatusPayload> = {},
): UpdateLeadStatusPayload {
  return { status, ...overrides }
}

export interface UpdateLeadNotesPayload {
  notes: string
}

export function buildUpdateLeadNotesPayload(
  overrides: Partial<UpdateLeadNotesPayload> = {},
): UpdateLeadNotesPayload {
  return {
    notes: `Anotação de teste ${uid()}. Cliente com potencial de conversão.`,
    ...overrides,
  }
}

export interface UpdateLeadPitchPayload {
  pitchContent: string
  pitchTone?: string
}

export function buildUpdateLeadPitchPayload(
  overrides: Partial<UpdateLeadPitchPayload> = {},
): UpdateLeadPitchPayload {
  return {
    pitchContent: `Pitch de teste ${uid()}: Olá, somos especialistas em transformação digital...`,
    pitchTone: 'formal',
    ...overrides,
  }
}

// ─── Admin Config ─────────────────────────────────────────────────────────────

export interface UpsertCredentialPayload {
  apiKey: string
}

export function buildUpsertCredentialPayload(
  overrides: Partial<UpsertCredentialPayload> = {},
): UpsertCredentialPayload {
  return {
    apiKey: `test-api-key-${uid()}`,
    ...overrides,
  }
}

export interface UpdateScoringRulePayload {
  weight?: number
  isActive?: boolean
}

export function buildUpdateScoringRulePayload(
  overrides: Partial<UpdateScoringRulePayload> = {},
): UpdateScoringRulePayload {
  return {
    weight: 3,
    isActive: true,
    ...overrides,
  }
}
