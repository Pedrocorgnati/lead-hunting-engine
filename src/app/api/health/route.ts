import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import packageJson from '../../../../package.json'

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({
      status: 'ok',
      db: 'connected',
      timestamp: new Date().toISOString(),
      version: packageJson.version,
    })
  } catch {
    return NextResponse.json(
      { status: 'error', db: 'disconnected', timestamp: new Date().toISOString(), version: packageJson.version },
      { status: 503 }
    )
  }
}
