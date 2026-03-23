import { prisma } from '@/lib/prisma'

interface AuditEntry {
  userId?: string
  action: string
  resource: string
  resourceId?: string
  metadata?: Record<string, unknown>
  ipAddress?: string
}

const SENSITIVE_FIELDS = ['password', 'token', 'apiKey', 'encryptedKey', 'email', 'phone']

function sanitizeMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!metadata) return undefined
  const sanitized = { ...metadata }
  for (const field of SENSITIVE_FIELDS) {
    if (field in sanitized) {
      sanitized[field] = '***REDACTED***'
    }
  }
  return sanitized
}

export class AuditService {
  async log(entry: AuditEntry): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: entry.userId,
          action: entry.action,
          resource: entry.resource,
          resourceId: entry.resourceId,
          metadata: (sanitizeMetadata(entry.metadata) ?? undefined) as Record<string, string | number | boolean | null> | undefined,
          ipAddress: entry.ipAddress,
        },
      })
    } catch (error) {
      console.error('[AuditService] Failed to log:', error)
    }
  }
}

export const auditService = new AuditService()
