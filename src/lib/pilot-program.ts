/**
 * Programa piloto (Task 56 / C6) — taxonomia admin propria reutilizando o
 * cohort por tags `pilot-{periodo}` ja convencionado em M14-G-010
 * (`/api/v1/admin/users/[id]/tags`). NAO duplica dados: o cohort vive nas
 * `UserProfile.tags`, as entrevistas viram `Notification`, os KPIs sao
 * derivados de leads/onboarding/NPS existentes.
 */

export const PILOT_TAG_PREFIX = 'pilot-'

/** Regra canonica de uma tag de programa piloto: `pilot-{periodo}` em kebab. */
export const PILOT_TAG_REGEX = /^pilot-[a-z0-9-]+$/

export function isPilotTag(tag: string): boolean {
  return PILOT_TAG_REGEX.test(tag)
}

/** Extrai apenas as tags de piloto de um conjunto de tags do usuario. */
export function pilotTagsOf(tags: readonly string[]): string[] {
  return tags.filter(isPilotTag)
}

/** Um usuario pertence ao cohort piloto se tiver ao menos uma tag `pilot-*`. */
export function isInPilotCohort(tags: readonly string[]): boolean {
  return tags.some(isPilotTag)
}
