/**
 * TASK-8 intake-review (CL-298): serializer JSON para export de leads.
 *
 * Schema:
 *   {
 *     "leads": [ ...lead ],
 *     "exportedAt": "2026-04-24T12:34:56.000Z",
 *     "filters": { ...filters aplicados, omitindo undefined },
 *     "meta": { "count": N, "format": "JSON", "version": "v1" }
 *   }
 */

export interface ExportableLead {
  id: string
  businessName: string | null
  category: string | null
  city: string | null
  state: string | null
  phone: string | null
  website: string | null
  email: string | null
  score: number | null
  temperature: string | null
  opportunities: unknown
  status: string | null
  createdAt: Date | string
}

export function leadsToJson(
  leads: ExportableLead[],
  filters: Record<string, unknown> = {}
): string {
  const cleanedFilters = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== '')
  )

  const payload = {
    meta: {
      count: leads.length,
      format: 'JSON',
      version: 'v1',
    },
    exportedAt: new Date().toISOString(),
    filters: cleanedFilters,
    leads: leads.map((lead) => ({
      ...lead,
      createdAt:
        typeof lead.createdAt === 'string'
          ? lead.createdAt
          : lead.createdAt.toISOString(),
    })),
  }

  return JSON.stringify(payload, null, 2)
}
