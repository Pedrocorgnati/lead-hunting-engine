import { successResponse } from '@/lib/api-utils'
import { TEMPLATE_PLACEHOLDERS, TEMPLATE_PLACEHOLDER_REGEX } from '@/lib/pitch/template-vars'

/**
 * Placeholders REAIS (substituídos no envio). Antes a rota anunciava
 * nome/empresa/segmento que nunca eram substituídos — agora reflete o
 * vocabulário canônico de template-vars (lead + remetente).
 */
export async function GET() {
  return successResponse({
    placeholders: TEMPLATE_PLACEHOLDERS,
    keys: TEMPLATE_PLACEHOLDERS.map((p) => p.key),
    placeholderRegex: TEMPLATE_PLACEHOLDER_REGEX,
  })
}
