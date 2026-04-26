import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { radarService } from '@/lib/services/radar-service'

/**
 * GET /api/v1/radar/presets
 *
 * Lista combinacoes unicas regiao+nicho do historico do operador,
 * para permitir recoleta na tela Radar (CL-102).
 */
export async function GET() {
  try {
    const user = await requireAuth()
    const presets = await radarService.listPresets(user.id)
    return NextResponse.json({
      data: presets,
      meta: { total: presets.length },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
