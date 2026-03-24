import { formatDate } from '@/lib/utils/format'

export interface ProvenanceRow {
  id: string
  field: string
  source: string
  sourceUrl: string | null
  collectedAt: string
  confidence: number
}

interface Props {
  entries: ProvenanceRow[]
}

const FIELD_LABELS: Record<string, string> = {
  businessName: 'Nome',
  phone: 'Telefone',
  website: 'Site',
  email: 'Email',
  address: 'Endereço',
  city: 'Cidade',
  state: 'Estado',
  category: 'Categoria',
  instagramHandle: 'Instagram',
  rating: 'Avaliação',
  reviewCount: 'Nº avaliações',
  latitude: 'Latitude',
  longitude: 'Longitude',
  score: 'Score',
  opportunities: 'Oportunidades',
}

const SOURCE_LABELS: Record<string, string> = {
  GOOGLE_MAPS: 'Google Maps',
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  WEBSITE: 'Site',
  YELP: 'Yelp',
  APONTADOR: 'Apontador',
  GUIA_MAIS: 'Guia Mais',
  OUTSCRAPER: 'Outscraper',
  APIFY: 'Apify',
  HERE_PLACES: 'Here Places',
  TOMTOM: 'TomTom',
}

export function ProvenanceTable({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
        Nenhum histórico de provenance registrado.
      </div>
    )
  }

  return (
    <div className="rounded-lg border overflow-x-auto">
      <table className="w-full text-sm min-w-[480px]">
        <thead className="bg-muted/50">
          <tr>
            {['Campo', 'Fonte', 'Confiança', 'Coletado em'].map((h) => (
              <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td className="px-4 py-3 font-medium">
                {FIELD_LABELS[entry.field] ?? entry.field}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {SOURCE_LABELS[entry.source] ?? entry.source}
                {entry.sourceUrl && (
                  <a
                    href={entry.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 text-xs text-primary hover:underline"
                    aria-label={`Ver fonte: ${entry.sourceUrl}`}
                  >
                    ↗
                  </a>
                )}
              </td>
              <td className="px-4 py-3 font-mono">
                {Math.round(entry.confidence * 100)}%
              </td>
              <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                {formatDate(entry.collectedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
