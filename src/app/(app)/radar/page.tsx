import type { Metadata } from 'next'
import Link from 'next/link'
import { Activity, MapPin, Building2, Flame, ArrowRight, Sparkles } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Routes } from '@/lib/constants/routes'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RadarActions } from './_components/RadarActions'
import { RadarPresetList } from '@/components/radar/RadarPresetList'
import { radarService } from '@/lib/services/radar-service'
import { DedupEngine } from '@/lib/intelligence/dedup-engine'

export const metadata: Metadata = { title: 'Radar de leads' }
export const dynamic = 'force-dynamic'

const WINDOW_HOURS = 24
const HOT_THRESHOLD = 80

export default async function RadarPage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect(Routes.LOGIN)

  const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000)

  const [leads, presets] = await Promise.all([
    prisma.lead.findMany({
      where: { userId: user.id, createdAt: { gte: since } },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      select: {
        id: true,
        businessName: true,
        category: true,
        city: true,
        state: true,
        score: true,
        temperature: true,
        status: true,
        opportunities: true,
        createdAt: true,
        metadata: true,
      },
    }),
    radarService.listPresets(user.id),
  ])

  return (
    <div data-testid="radar-page" className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" aria-hidden="true" />
            Radar
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Leads descobertos nas últimas {WINDOW_HOURS} horas, ordenados por score.
          </p>
        </div>
        <Link
          href={`${Routes.LEADS}?recency=24h`}
          className="text-sm text-primary hover:underline flex items-center gap-1"
          data-testid="radar-go-leads"
        >
          Ver na lista completa
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <section aria-labelledby="radar-presets-heading" className="space-y-2">
        <h2 id="radar-presets-heading" className="text-sm font-semibold text-foreground">
          Presets de recoleta
        </h2>
        <p className="text-xs text-muted-foreground">
          Dispare uma nova coleta usando as mesmas combinações região + nicho já coletadas.
        </p>
        <RadarPresetList presets={presets} />
      </section>

      {leads.length === 0 ? (
        <Card data-testid="radar-empty-state">
          <CardContent className="py-10 flex flex-col items-center text-center gap-2">
            <Activity className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Nenhum lead novo nas últimas {WINDOW_HOURS} horas.
            </p>
            <p className="text-xs text-muted-foreground">
              Dispare uma nova coleta em <Link href={Routes.COLETAS} className="text-primary hover:underline">Coletas</Link>.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="radar-leads-grid">
          {leads.map((l) => {
            const isHot = l.score > HOT_THRESHOLD
            const isNewFromRadar = DedupEngine.isLeadNewFromRadar(l.metadata)
            return (
              <li key={l.id}>
                <Card data-testid={`radar-lead-${l.id}`} className="h-full">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Link
                          href={Routes.LEAD_DETAIL(l.id)}
                          className="hover:underline"
                        >
                          {l.businessName}
                        </Link>
                        {isNewFromRadar && (
                          <Badge
                            variant="default"
                            className="text-[10px]"
                            data-testid={`radar-new-badge-${l.id}`}
                          >
                            <Sparkles className="h-3 w-3 mr-1" aria-hidden="true" />
                            novo
                          </Badge>
                        )}
                      </CardTitle>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge
                          variant={isHot ? 'destructive' : 'secondary'}
                          data-testid={`radar-score-badge-${l.id}`}
                        >
                          {isHot && <Flame className="h-3 w-3 mr-1" aria-hidden="true" />}
                          {l.score}/100
                        </Badge>
                        {isHot && (
                          <span className="text-[10px] uppercase tracking-wide text-destructive font-semibold">
                            Quente
                          </span>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
                      {l.category && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" aria-hidden="true" />
                          {l.category}
                        </span>
                      )}
                      {l.city && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" aria-hidden="true" />
                          {l.city}{l.state ? `, ${l.state}` : ''}
                        </span>
                      )}
                      <span>
                        {new Date(l.createdAt).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {l.opportunities.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {l.opportunities.slice(0, 3).map((op) => (
                          <Badge key={op} variant="outline" className="text-[10px]">
                            {op}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <RadarActions leadId={l.id} status={l.status} />
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
