import { MapPin, Briefcase, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { RadarPreset } from '@/lib/services/radar-service'
import { RadarRecollectButton } from './RadarRecollectButton'

export interface RadarPresetListProps {
  presets: RadarPreset[]
}

export function RadarPresetList({ presets }: RadarPresetListProps) {
  if (presets.length === 0) {
    return (
      <Card data-testid="radar-presets-empty">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Ainda não há coletas concluídas para reutilizar como preset. Dispare
          uma coleta em Coletas primeiro.
        </CardContent>
      </Card>
    )
  }

  return (
    <ul
      className="grid grid-cols-1 md:grid-cols-2 gap-3"
      data-testid="radar-presets-grid"
    >
      {presets.map((p) => {
        const key = `${p.state ?? ''}|${p.city}|${p.niche}`
        return (
          <li key={key}>
            <Card data-testid={`radar-preset-${p.niche}-${p.city}`.toLowerCase().replace(/\s+/g, '-')}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-primary" aria-hidden="true" />
                    {p.niche}
                  </CardTitle>
                  <Badge variant="secondary" className="text-[10px]">
                    {p.leadsCount} leads
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" aria-hidden="true" />
                    {p.city}{p.state ? `, ${p.state}` : ''}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {p.lastCollectedAt
                      ? new Date(p.lastCollectedAt).toLocaleDateString('pt-BR')
                      : '—'}
                  </span>
                </div>
                <RadarRecollectButton
                  city={p.city}
                  state={p.state}
                  niche={p.niche}
                  lastCollectedAt={p.lastCollectedAt}
                />
              </CardContent>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
