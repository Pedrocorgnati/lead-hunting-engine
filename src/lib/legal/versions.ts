/**
 * Versões vigentes dos documentos legais.
 *
 * Ficam sincronizadas com o frontmatter dos arquivos em
 * `src/content/legal/*.md`. Em caso de atualização do conteúdo,
 * bumpar aqui também para refletir no rodapé sem precisar ler
 * os markdowns no client.
 */

export const LEGAL_VERSIONS = {
  termsVersion: '1.0',
  privacyVersion: '1.0',
  /** Data de atualização — formato DD/MM/YYYY. */
  updatedAt: '21/04/2026',
} as const
