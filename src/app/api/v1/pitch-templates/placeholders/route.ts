import { successResponse } from '@/lib/api-utils'

const PLACEHOLDERS = [
  {
    key: 'nome',
    label: 'Nome',
    example: 'João Silva',
    description: 'Nome do contato',
    required: true,
  },
  {
    key: 'empresa',
    label: 'Empresa',
    example: 'Acme Corp',
    description: 'Nome da empresa',
    required: false,
  },
  {
    key: 'segmento',
    label: 'Segmento',
    example: 'Tecnologia',
    description: 'Segmento ou nicho da empresa',
    required: false,
  },
] as const

export async function GET() {
  return successResponse({
    placeholders: PLACEHOLDERS,
    keys: PLACEHOLDERS.map((item) => item.key),
    placeholderRegex: String.raw`\{\{\s*([a-zA-Z0-9_]+)\s*\}\}`,
  })
}
