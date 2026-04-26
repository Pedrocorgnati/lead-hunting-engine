import { RateLimiter } from '../utils/rate-limiter'
import { withRetry } from '../utils/retry-backoff'
import { CircuitBreaker } from '../utils/circuit-breaker'
import { IG_FALLBACK_CB_KEY } from './instagram-apify'
import type { SocialProvider, SocialSearchParams, SocialProfileData } from './types'

/**
 * Fallback secundario de Instagram via PhantomBuster. Compartilha o mesmo
 * circuit breaker de Apify: se Apify abriu o circuito para um tenant, a
 * chamada ao PhantomBuster tambem falha rapidamente ate a janela expirar.
 */

const PB_BASE = 'https://api.phantombuster.com/api/v2'

interface PhantomBusterLaunchResponse {
  containerId?: string
  error?: string
}

interface PhantomBusterStatusResponse {
  status?: string
  resultObject?: string | null
  exitCode?: number
}

interface PhantomBusterProfile {
  username?: string
  fullName?: string
  followersCount?: number
  biography?: string
  externalUrl?: string | null
  lastPostTimestamp?: number | null
  postsCount?: number | null
}

export const InstagramPhantomBusterProvider: SocialProvider = {
  name: 'instagram-phantombuster',

  async collect(params: SocialSearchParams, apiKey: string): Promise<SocialProfileData[]> {
    if (!apiKey) throw new Error('PHANTOMBUSTER_KEY_MISSING: token nao configurado')
    CircuitBreaker.ensureClosed(IG_FALLBACK_CB_KEY)
    const agentId = process.env.PHANTOMBUSTER_IG_AGENT_ID ?? ''
    if (!agentId) {
      throw new Error('PHANTOMBUSTER_IG_AGENT_ID nao configurado — PhantomBuster exige agent id')
    }

    await RateLimiter.wait('phantombuster')

    const handle = params.handle ?? params.query.replace(/^ig:\/\//, '')

    try {
      const launch = await withRetry(async () => {
        const res = await fetch(`${PB_BASE}/agents/launch`, {
          method: 'POST',
          headers: {
            'X-Phantombuster-Key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: agentId,
            argument: { profiles: [handle] },
          }),
        })
        if (!res.ok) throw new Error(`PhantomBuster launch HTTP ${res.status}`)
        return res.json() as Promise<PhantomBusterLaunchResponse>
      })

      if (launch.error) throw new Error(`PhantomBuster error: ${launch.error}`)
      const containerId = launch.containerId
      if (!containerId) throw new Error('PhantomBuster: sem containerId')

      // Polling ate concluir (max 12 tentativas de 5s = 60s).
      let status: PhantomBusterStatusResponse = {}
      for (let poll = 0; poll < 12; poll++) {
        await new Promise(r => setTimeout(r, 5000))
        const r = await fetch(`${PB_BASE}/containers/fetch?id=${containerId}`, {
          headers: { 'X-Phantombuster-Key': apiKey },
        })
        status = (await r.json()) as PhantomBusterStatusResponse
        if (status.status && status.status !== 'running') break
      }

      if (status.status !== 'finished' || status.exitCode !== 0) {
        throw new Error(`PhantomBuster status: ${status.status} exit=${status.exitCode ?? '?'}`)
      }

      const raw = status.resultObject ? (JSON.parse(status.resultObject) as PhantomBusterProfile[]) : []
      if (!raw.length) {
        CircuitBreaker.recordSuccess(IG_FALLBACK_CB_KEY)
        return []
      }

      const profile = raw[0]
      const lastPostAt = profile.lastPostTimestamp
        ? new Date(profile.lastPostTimestamp * 1000)
        : null

      CircuitBreaker.recordSuccess(IG_FALLBACK_CB_KEY)

      return [{
        handle: profile.username ?? handle,
        followers: profile.followersCount ?? null,
        bio: profile.biography ?? null,
        externalLink: profile.externalUrl ?? null,
        lastPostAt,
        postsLast30d: null,
        engagementRate: null,
        abandonedSignal: lastPostAt
          ? (Date.now() - lastPostAt.getTime()) / 86_400_000 > 90
          : true,
        source: 'instagram-phantombuster',
        rawJson: profile as unknown as Record<string, unknown>,
      }]
    } catch (err) {
      CircuitBreaker.recordFailure(IG_FALLBACK_CB_KEY)
      throw err
    }
  },
}
