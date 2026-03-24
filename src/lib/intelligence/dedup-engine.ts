import { getPrisma } from '@/lib/prisma'

export interface DedupCandidate {
  name: string
  address: string | null
  externalId: string
}

export interface DedupResult {
  isDuplicate: boolean
  existingLeadId: string | null
  similarity: number
}

const SIMILARITY_THRESHOLD = 0.85

export class DedupEngine {
  /**
   * Verifica se um RawLeadData é duplicata de um Lead existente.
   * Compara businessName + address usando Levenshtein similarity.
   */
  static async check(candidate: DedupCandidate): Promise<DedupResult> {
    if (!candidate.name) return { isDuplicate: false, existingLeadId: null, similarity: 0 }

    const prisma = getPrisma()
    const nameParts = candidate.name.toLowerCase().split(' ').slice(0, 2).join('%')

    const existingLeads = await prisma.lead.findMany({
      where: {
        businessName: { contains: nameParts, mode: 'insensitive' },
      },
      select: { id: true, businessName: true, address: true },
      take: 20,
    })

    if (existingLeads.length === 0) {
      return { isDuplicate: false, existingLeadId: null, similarity: 0 }
    }

    let bestMatch = { id: '', similarity: 0 }

    for (const lead of existingLeads) {
      const nameKey = `${candidate.name} ${candidate.address ?? ''}`.toLowerCase().trim()
      const existingKey = `${lead.businessName} ${lead.address ?? ''}`.toLowerCase().trim()

      const similarity = stringSimilarity(nameKey, existingKey)

      if (similarity > bestMatch.similarity) {
        bestMatch = { id: lead.id, similarity }
      }
    }

    const isDuplicate = bestMatch.similarity >= SIMILARITY_THRESHOLD

    return {
      isDuplicate,
      existingLeadId: isDuplicate ? bestMatch.id : null,
      similarity: bestMatch.similarity,
    }
  }

  /**
   * Filtra um array de candidatos removendo duplicatas entre si (dedup intra-batch).
   * Chamado antes de inserir um batch de RawLeadData para evitar duplicatas dentro do mesmo job.
   */
  static deduplicateWithinBatch(candidates: DedupCandidate[]): DedupCandidate[] {
    const seen = new Map<string, DedupCandidate>()

    for (const candidate of candidates) {
      const key = `${candidate.name?.toLowerCase().trim()} | ${candidate.address?.toLowerCase().trim() ?? ''}`
      const isDupInBatch = Array.from(seen.values()).some(existing => {
        const existingKey = `${existing.name?.toLowerCase().trim()} | ${existing.address?.toLowerCase().trim() ?? ''}`
        return stringSimilarity(key, existingKey) >= SIMILARITY_THRESHOLD
      })

      if (!isDupInBatch) {
        seen.set(key, candidate)
      }
    }

    return Array.from(seen.values())
  }
}

/**
 * Calcula similaridade entre dois strings (0-1).
 * Usa combinação de Levenshtein (60%) e Jaccard coefficient (40%).
 */
export function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (!a || !b) return 0

  const maxLen = Math.max(a.length, b.length)
  const levenshtein = levenshteinDistance(a, b)
  const levSimilarity = 1 - levenshtein / maxLen

  const wordsA = new Set(a.split(' '))
  const wordsB = new Set(b.split(' '))
  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)))
  const union = new Set([...wordsA, ...wordsB])
  const jaccardSimilarity = intersection.size / union.size

  // Levenshtein 95% + Jaccard 5%: prioriza fortemente distância de edição, evitando
  // penalidade excessiva do Jaccard para variações de uma única palavra (ex: 'tokyo' vs 'tokio')
  return levSimilarity * 0.95 + jaccardSimilarity * 0.05
}

function levenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i])
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      )
    }
  }

  return matrix[b.length][a.length]
}
