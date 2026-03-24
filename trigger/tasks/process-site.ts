import { task } from '@trigger.dev/sdk/v3'
import { analyzeSite } from '@/lib/workers/providers/site-analyzer'
import { getPrisma } from '@/lib/prisma'

interface ProcessSitePayload {
  rawLeadId: string
  url: string
}

export const processSiteTask = task({
  id: 'process-site',
  run: async (payload: ProcessSitePayload) => {
    const result = await analyzeSite(payload.url)

    const prisma = getPrisma()
    await prisma.rawLeadData.update({
      where: { id: payload.rawLeadId },
      data: {
        siteReachable: result.reachable,
        siteHasSsl: result.hasSsl,
        siteTitle: result.title?.slice(0, 500) ?? null,
        siteMobileFriendly: result.mobileFriendly,
      },
    })

    return { ok: result.reachable, url: result.finalUrl }
  },
})
