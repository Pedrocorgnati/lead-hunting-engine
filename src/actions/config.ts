import { CredentialProvider } from '@/lib/constants/enums'

export interface CredentialDto {
  id: string
  label: string
  provider: CredentialProvider
  maskedValue: string
  isActive: boolean
  createdAt: string
}

export interface ScoringRule {
  dimension: string
  label: string
  description: string
  weight: number
}

export const DEFAULT_SCORING_RULES: ScoringRule[] = [
  { dimension: 'website_presence', label: 'Presença Web', description: 'Possui site? HTTPS? Mobile-friendly?', weight: 20 },
  { dimension: 'social_presence', label: 'Presença Social', description: 'Instagram, Facebook, LinkedIn, Google Meu Negócio', weight: 20 },
  { dimension: 'reviews', label: 'Avaliações', description: 'Quantidade e qualidade de avaliações online', weight: 20 },
  { dimension: 'location', label: 'Localização', description: 'Relevância geográfica e presença local', weight: 15 },
  { dimension: 'digital_maturity', label: 'Maturidade Digital', description: 'Nível geral de presença e maturidade digital', weight: 15 },
  { dimension: 'digital_gap', label: 'Gap Digital', description: 'Oportunidade de melhoria identificada', weight: 10 },
]

// TODO: Implementar backend — run /auto-flow execute
export async function getCredentials(): Promise<CredentialDto[]> {
  return []
}

// TODO: Implementar backend — run /auto-flow execute
export async function createCredential(_data: {
  label: string
  provider: CredentialProvider
  apiKey: string
}): Promise<{ id: string }> {
  throw new Error('Not implemented - run /auto-flow execute')
}

// TODO: Implementar backend — run /auto-flow execute
export async function updateCredential(_id: string, _data: {
  label?: string
  apiKey?: string
}): Promise<{ success: boolean }> {
  throw new Error('Not implemented - run /auto-flow execute')
}

// TODO: Implementar backend — run /auto-flow execute
export async function deleteCredential(_id: string): Promise<{ success: boolean }> {
  throw new Error('Not implemented - run /auto-flow execute')
}

// TODO: Implementar backend — run /auto-flow execute
export async function testCredential(_id: string): Promise<{
  success: boolean
  message: string
}> {
  throw new Error('Not implemented - run /auto-flow execute')
}

// TODO: Implementar backend — run /auto-flow execute
export async function getScoringRules(): Promise<ScoringRule[]> {
  return DEFAULT_SCORING_RULES
}

// TODO: Implementar backend — run /auto-flow execute
export async function saveScoringRules(_rules: ScoringRule[]): Promise<{ success: boolean }> {
  throw new Error('Not implemented - run /auto-flow execute')
}
