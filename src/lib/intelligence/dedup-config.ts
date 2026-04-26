/**
 * TASK-9 intake-review (CL-223): thresholds de deduplicacao externalizados.
 *
 * Enquanto SystemConfig.dedup.* nao existe, estes valores vem de env vars
 * com fallback conservador. Ajustar apos coletar baseline p90 de similarity
 * em `duplicate_candidates`.
 *
 * Regras:
 *   similarity >= AUTO_MERGE_MIN_SCORE   -> auto-merge (sem revisao)
 *   similarity >= PENDING_REVIEW_MIN     -> PENDING (revisao humana)
 *   similarity <  PENDING_REVIEW_MIN     -> ignora (nao e duplicata)
 */

function parseNumber(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

export const DEDUP_CONFIG = {
  /** Acima disso, merge automatico. Default conservador. */
  autoMergeMinScore: parseNumber(process.env.DEDUP_AUTO_MERGE_MIN, 0.95),
  /** Abaixo disso, nao registra candidato. Entre isso e autoMergeMinScore = PENDING. */
  pendingReviewMin: parseNumber(process.env.DEDUP_PENDING_REVIEW_MIN, 0.75),
  /** Janela em dias para undo de merges humanos. */
  undoWindowDays: parseNumber(process.env.DEDUP_UNDO_WINDOW_DAYS, 7),
} as const

export type DedupClassification =
  | 'auto_merge'
  | 'pending_review'
  | 'ignore'

export function classifyDedupScore(similarity: number): DedupClassification {
  if (similarity >= DEDUP_CONFIG.autoMergeMinScore) return 'auto_merge'
  if (similarity >= DEDUP_CONFIG.pendingReviewMin) return 'pending_review'
  return 'ignore'
}

export function isWithinUndoWindow(mergedAt: Date | null | undefined): boolean {
  if (!mergedAt) return false
  const windowMs = DEDUP_CONFIG.undoWindowDays * 24 * 60 * 60 * 1000
  return Date.now() - mergedAt.getTime() <= windowMs
}
