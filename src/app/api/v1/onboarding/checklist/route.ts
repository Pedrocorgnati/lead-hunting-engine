import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { Routes } from '@/lib/constants'

export const dynamic = 'force-dynamic'

export const CHECKLIST_ITEMS = [
  {
    id: 'perfil-completo',
    label: 'Completar perfil',
    description: 'Adicione nome, foto e informacoes da empresa.',
    href: Routes.PERFIL ?? '/perfil',
    required: true,
  },
  {
    id: 'primeira-coleta',
    label: 'Criar primeira coleta',
    description: 'Inicie sua primeira busca de leads com a ferramenta de coleta.',
    href: '/coletas/nova',
    required: true,
  },
  {
    id: 'convite-membro',
    label: 'Convidar um membro',
    description: 'Adicione um colaborador a sua conta.',
    href: Routes.ADMIN_CONVITES ?? '/admin/convites',
    required: false,
  },
  {
    id: 'configurar-providers',
    label: 'Configurar provedores',
    description: 'Configure suas credenciais de provedores de dados.',
    href: '/admin/credenciais',
    required: false,
  },
] as const

export type ChecklistItemId = (typeof CHECKLIST_ITEMS)[number]['id']

export async function GET() {
  try {
    const user = await requireAuth()

    const profile = await prisma.userProfile.findUnique({
      where: { id: user.id },
      select: { onboardingData: true },
    })

    const data = (profile?.onboardingData as Record<string, unknown> | null) ?? {}
    const completedItems = Array.isArray(data.checklist_completed) ? (data.checklist_completed as string[]) : []

    const items = CHECKLIST_ITEMS.map((item) => ({
      ...item,
      completed: completedItems.includes(item.id),
      // Hook de gating: hoje a aplicacao e single-tier, entao nenhum item e
      // bloqueado. Quando houver plano/entitlement, definir blocked=true +
      // blockedReason aqui (ex.: coletas indisponiveis no plano atual).
      blocked: false,
      blockedReason: null as string | null,
    }))

    const completedCount = items.filter((i) => i.completed).length

    return successResponse({
      items,
      progress: { completed: completedCount, total: items.length },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
