import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { assertRateLimit, getClientIp } from '@/lib/rate-limiter'
import { profileService } from '@/services/profile.service'

/**
 * DSAR endpoint (LGPD Art. 18 V) — direito de portabilidade.
 * Retorna JSON com TODOS os dados pessoais do usuario autenticado.
 *
 * Rate limit: 1 request por hora por usuario (operacao cara).
 */
export async function GET(request: Request) {
  try {
    const user = await requireAuth()

    // 1 export/hora/user — janela em segundos
    assertRateLimit(`profile:data-export:${user.id}`, 1, 60 * 60)

    const ipAddress = getClientIp(request)
    const exportData = await profileService.exportData(user.id, ipAddress)

    const date = new Date().toISOString().slice(0, 10)
    const filename = `lead-hunting-engine-export-${user.id}-${date}.json`

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store, max-age=0',
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
