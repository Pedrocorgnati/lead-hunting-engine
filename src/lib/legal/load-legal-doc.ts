/**
 * Carrega documentos legais (Termos/Privacidade) versionados em `src/content/legal/*.md`.
 *
 * Escopo intencionalmente limitado: os markdowns são conteúdo controlado
 * interno. O parser suporta apenas o subset usado em terms-v1.md e
 * privacy-v1.md (headings H1-H3, parágrafos, listas, blockquote, hr, negrito,
 * itálico, inline code, links e HR).
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface LegalDocMeta {
  version: string
  updatedAt: string
  status: string
}

export interface LegalDoc {
  meta: LegalDocMeta
  body: string
}

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n/

function parseFrontmatter(raw: string): { meta: LegalDocMeta; body: string } {
  const match = raw.match(FRONTMATTER_RE)
  if (!match) {
    return {
      meta: { version: 'unknown', updatedAt: 'unknown', status: 'unknown' },
      body: raw,
    }
  }

  const metaRaw = match[1]
  const body = raw.slice(match[0].length)

  const meta: Record<string, string> = {}
  for (const line of metaRaw.split('\n')) {
    const m = line.match(/^([a-zA-Z0-9_-]+):\s*"?(.*?)"?\s*$/)
    if (m) meta[m[1]] = m[2]
  }

  return {
    meta: {
      version: meta.version ?? 'unknown',
      updatedAt: meta.updatedAt ?? 'unknown',
      status: meta.status ?? 'unknown',
    },
    body,
  }
}

export async function loadLegalDoc(fileName: string): Promise<LegalDoc> {
  const filePath = path.join(process.cwd(), 'src', 'content', 'legal', fileName)
  const raw = await fs.readFile(filePath, 'utf8')
  return parseFrontmatter(raw)
}

export function formatUpdatedAt(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso
  return `${m[3]}/${m[2]}/${m[1]}`
}
