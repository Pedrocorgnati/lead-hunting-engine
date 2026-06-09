import type { Prisma } from '@prisma/client'

export type LeadTaskItem = {
  id: string
  title: string
  dueAt: string | null
  completed: boolean
  createdAt: string
  updatedAt: string
}

export const MAX_TASK_TITLE_CHARS = 180

function normalizeDueAt(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const cleaned = raw.trim()
  if (!cleaned) return null

  const parsed = new Date(cleaned)
  if (Number.isNaN(parsed.getTime())) return null

  return parsed.toISOString()
}

export function sanitizeLeadTask(raw: unknown): LeadTaskItem[] {
  if (!Array.isArray(raw)) return []
  const now = new Date().toISOString()

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const typed = entry as Partial<LeadTaskItem>
      const title = typeof typed.title === 'string' ? typed.title.trim() : ''
      if (!title) return null

      const dueAt = normalizeDueAt(typed.dueAt)
      const completed = typed.completed === true
      const createdAt = typeof typed.createdAt === 'string' ? typed.createdAt : now
      const updatedAt = typeof typed.updatedAt === 'string' ? typed.updatedAt : now

      return {
        id: typeof typed.id === 'string' ? typed.id : crypto.randomUUID(),
        title,
        dueAt,
        completed,
        createdAt,
        updatedAt,
      }
    })
    .filter((entry): entry is LeadTaskItem => !!entry)
}

export function getLeadTasksFromMetadata(metadata: Prisma.JsonValue | null): LeadTaskItem[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return []
  return sanitizeLeadTask((metadata as { leadTasks?: unknown }).leadTasks)
}

export function writeLeadTasksToMetadata(tasks: LeadTaskItem[]): Record<string, Prisma.JsonValue> {
  return { leadTasks: tasks }
}

export const MAX_TASK_TITLE = MAX_TASK_TITLE_CHARS
