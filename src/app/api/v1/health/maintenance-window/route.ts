import { NextResponse } from 'next/server'
import { getMaintenanceWindowConfig, toPublicMaintenanceWindow } from '@/lib/maintenance-window'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const window = toPublicMaintenanceWindow(await getMaintenanceWindowConfig())
  return NextResponse.json(
    {
      data: {
        active: Boolean(window),
        window,
      },
    },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}
