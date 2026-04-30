import 'server-only'

/**
 * Feature Flags — Repositorio typed (CRUD).
 *
 * Cobre: TASK-4/ST006.
 *
 * Sem logica de negocio; logica de toggle/audit vive em `audit.ts` e em
 * server actions do painel admin (TASK-3). Aqui apenas reads/writes
 * tipados com Zod no input.
 */

import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { unsafeFeatureFlagName } from './types'
import type {
  FeatureFlagChangeKind,
  FeatureFlagEnv,
  FeatureFlagName,
  JsonValue,
} from './types'

// Casts internos — Prisma trata Json como `Prisma.JsonValue` que e equivalente
// estrutural ao nosso `JsonValue`.
type JsonInput = JsonValue
type FlagRow = {
  id: string
  name: string
  description: string | null
  ownerModule: string
  defaultValue: unknown
  tags: string[]
  envValues: unknown
  externalProviderId: string | null
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
  createdBy: string
}

const NameSchema = z
  .string()
  .min(3)
  .regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/, {
    message: 'Formato esperado: dominio.modulo.sub_feature (snake_case)',
  })

const FlagInputSchema = z.object({
  name: NameSchema,
  description: z.string().max(500).optional(),
  ownerModule: z.string().min(1).max(100),
  defaultValue: z.unknown(),
  tags: z.array(z.string().max(40)).max(20).default([]),
  externalProviderId: z.string().max(200).optional(),
  createdBy: z.string().min(1),
})

const FlagPatchSchema = z.object({
  description: z.string().max(500).optional(),
  defaultValue: z.unknown().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  externalProviderId: z.string().max(200).optional(),
})

const ChangeInputSchema = z.object({
  flagId: z.string().min(1),
  env: z.enum(['development', 'preview', 'production']),
  kind: z.custom<FeatureFlagChangeKind>(),
  beforeValue: z.unknown(),
  afterValue: z.unknown(),
  reason: z.string().min(10).max(500),
  changedBy: z.string().min(1),
  changedByEmail: z.string().email(),
  ipAddress: z.string().min(1).max(64),
  userAgent: z.string().max(500).optional(),
})

const UsageItemSchema = z.object({
  filePath: z.string().min(1),
  lineStart: z.number().int().nonnegative(),
  lineEnd: z.number().int().nonnegative(),
  snippet: z.string().max(500),
})

export async function findFlag(name: FeatureFlagName): Promise<FlagRow | null> {
  return (await prisma.featureFlag.findUnique({
    where: { name: name as unknown as string },
  })) as FlagRow | null
}

export async function listFlags(filters?: {
  ownerModule?: string
  tag?: string
  archived?: boolean
}): Promise<FlagRow[]> {
  const archived = filters?.archived ?? false
  return (await prisma.featureFlag.findMany({
    where: {
      archivedAt: archived ? { not: null } : null,
      ownerModule: filters?.ownerModule,
      tags: filters?.tag ? { has: filters.tag } : undefined,
    },
    orderBy: { name: 'asc' },
  })) as FlagRow[]
}

export async function listAllForResolve(
  names: FeatureFlagName[]
): Promise<
  Array<{
    name: FeatureFlagName
    defaultValue: JsonValue
    envValues: Record<FeatureFlagEnv, JsonValue | null | undefined>
  }>
> {
  if (names.length === 0) return []
  const rows = (await prisma.featureFlag.findMany({
    where: { name: { in: names as unknown as string[] }, archivedAt: null },
  })) as FlagRow[]
  return rows.map((r) => ({
    name: unsafeFeatureFlagName(r.name),
    defaultValue: r.defaultValue as JsonValue,
    envValues: (r.envValues ?? {}) as Record<FeatureFlagEnv, JsonValue | null | undefined>,
  }))
}

export async function getEnvValue(
  flagId: string,
  env: FeatureFlagEnv
): Promise<JsonValue | null | undefined> {
  const row = (await prisma.featureFlag.findUnique({
    where: { id: flagId },
    select: { envValues: true },
  })) as { envValues: unknown } | null
  if (!row) return undefined
  const map = (row.envValues ?? {}) as Record<string, JsonValue | null | undefined>
  return map[env]
}

export async function createFlag(
  input: z.input<typeof FlagInputSchema>
): Promise<FlagRow> {
  const parsed = FlagInputSchema.parse(input)
  return (await prisma.featureFlag.create({
    data: {
      name: parsed.name,
      description: parsed.description,
      ownerModule: parsed.ownerModule,
      defaultValue: parsed.defaultValue as JsonInput as never,
      tags: parsed.tags,
      externalProviderId: parsed.externalProviderId,
      createdBy: parsed.createdBy,
    },
  })) as FlagRow
}

export async function updateFlag(
  name: FeatureFlagName,
  patch: z.input<typeof FlagPatchSchema>
): Promise<FlagRow> {
  const parsed = FlagPatchSchema.parse(patch)
  return (await prisma.featureFlag.update({
    where: { name: name as unknown as string },
    data: {
      description: parsed.description,
      defaultValue:
        parsed.defaultValue !== undefined ? (parsed.defaultValue as JsonInput as never) : undefined,
      tags: parsed.tags,
      externalProviderId: parsed.externalProviderId,
    },
  })) as FlagRow
}

export async function setEnvValue(args: {
  flagId: string
  env: FeatureFlagEnv
  value: JsonValue | null
}): Promise<FlagRow> {
  // Read-modify-write em transacao para evitar race em envValues JSON.
  return (await prisma.$transaction(async (tx) => {
    const row = (await tx.featureFlag.findUnique({
      where: { id: args.flagId },
      select: { envValues: true },
    })) as { envValues: unknown } | null
    if (!row) throw new Error(`feature flag id="${args.flagId}" nao encontrada`)
    const current = (row.envValues ?? {}) as Record<string, JsonValue | null>
    if (args.value === null) {
      delete current[args.env]
    } else {
      current[args.env] = args.value
    }
    return (await tx.featureFlag.update({
      where: { id: args.flagId },
      data: { envValues: current as JsonInput as never },
    })) as FlagRow
  })) as FlagRow
}

export async function archiveFlag(name: FeatureFlagName): Promise<FlagRow> {
  return (await prisma.featureFlag.update({
    where: { name: name as unknown as string },
    data: { archivedAt: new Date() },
  })) as FlagRow
}

export async function recordChange(
  input: z.input<typeof ChangeInputSchema>
): Promise<{ id: string }> {
  const parsed = ChangeInputSchema.parse(input)
  const row = await prisma.featureFlagChange.create({
    data: {
      flagId: parsed.flagId,
      env: parsed.env,
      kind: parsed.kind,
      beforeValue: (parsed.beforeValue ?? null) as JsonInput as never,
      afterValue: (parsed.afterValue ?? null) as JsonInput as never,
      reason: parsed.reason,
      changedBy: parsed.changedBy,
      changedByEmail: parsed.changedByEmail,
      ipAddress: parsed.ipAddress,
      userAgent: parsed.userAgent,
    },
    select: { id: true },
  })
  return row
}

export async function listChanges(
  flagId: string,
  options?: { limit?: number; cursor?: string }
): Promise<
  Array<{
    id: string
    env: string
    kind: string
    beforeValue: unknown
    afterValue: unknown
    reason: string
    changedBy: string
    changedByEmail: string
    ipAddress: string
    userAgent: string | null
    createdAt: Date
  }>
> {
  const limit = Math.min(options?.limit ?? 50, 200)
  return prisma.featureFlagChange.findMany({
    where: { flagId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: options?.cursor ? 1 : 0,
    cursor: options?.cursor ? { id: options.cursor } : undefined,
  })
}

export async function recordUsages(
  flagId: string,
  items: Array<z.input<typeof UsageItemSchema>>
): Promise<{ inserted: number }> {
  const parsed = items.map((i) => UsageItemSchema.parse(i))
  await prisma.featureFlagUsage.deleteMany({ where: { flagId } })
  if (parsed.length === 0) return { inserted: 0 }
  await prisma.featureFlagUsage.createMany({
    data: parsed.map((u) => ({ flagId, ...u })),
  })
  return { inserted: parsed.length }
}

export async function listUsages(flagId: string): Promise<
  Array<{
    id: string
    filePath: string
    lineStart: number
    lineEnd: number
    snippet: string
    scannedAt: Date
  }>
> {
  return prisma.featureFlagUsage.findMany({
    where: { flagId },
    orderBy: [{ filePath: 'asc' }, { lineStart: 'asc' }],
  })
}
