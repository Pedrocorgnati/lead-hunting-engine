// ─── Enums TypeScript (espelham exatamente os enums do schema.prisma) ───
// Padrão: objeto `as const` + tipo derivado para compatibilidade com bundlers

export const UserRole = {
  ADMIN: 'ADMIN',
  OPERATOR: 'OPERATOR',
} as const
export type UserRole = (typeof UserRole)[keyof typeof UserRole]

export const InviteStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
} as const
export type InviteStatus = (typeof InviteStatus)[keyof typeof InviteStatus]

export const CollectionJobStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  PAUSED: 'PAUSED',
  PARTIAL: 'PARTIAL',
  CANCELLED: 'CANCELLED',
} as const
export type CollectionJobStatus = (typeof CollectionJobStatus)[keyof typeof CollectionJobStatus]

export const DataSource = {
  GOOGLE_MAPS: 'GOOGLE_MAPS',
  INSTAGRAM: 'INSTAGRAM',
  FACEBOOK: 'FACEBOOK',
  WEBSITE: 'WEBSITE',
  YELP: 'YELP',
  APONTADOR: 'APONTADOR',
  GUIA_MAIS: 'GUIA_MAIS',
  LINKEDIN_COMPANY: 'LINKEDIN_COMPANY',
  HERE_PLACES: 'HERE_PLACES',
  TOMTOM: 'TOMTOM',
  OUTSCRAPER: 'OUTSCRAPER',
  APIFY: 'APIFY',
  SHOPEE: 'SHOPEE',
  MERCADOLIVRE: 'MERCADOLIVRE',
  OVERTURE_MAPS: 'OVERTURE_MAPS',
} as const
export type DataSource = (typeof DataSource)[keyof typeof DataSource]

export const EnrichmentStatus = {
  PENDING: 'PENDING',
  COMPLETE: 'COMPLETE',
  PARTIAL: 'PARTIAL',
} as const
export type EnrichmentStatus = (typeof EnrichmentStatus)[keyof typeof EnrichmentStatus]

export const LeadStatus = {
  NEW: 'NEW',
  CONTACTED: 'CONTACTED',
  NEGOTIATING: 'NEGOTIATING',
  CONVERTED: 'CONVERTED',
  DISCARDED: 'DISCARDED',
  DISQUALIFIED: 'DISQUALIFIED',
  FALSE_POSITIVE: 'FALSE_POSITIVE',
  ENRICHMENT_PENDING: 'ENRICHMENT_PENDING',
} as const
export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus]

export const LeadTemperature = {
  COLD: 'COLD',
  WARM: 'WARM',
  HOT: 'HOT',
} as const
export type LeadTemperature = (typeof LeadTemperature)[keyof typeof LeadTemperature]

export const OpportunityType = {
  A_NEEDS_SITE: 'A_NEEDS_SITE',
  B_NEEDS_SYSTEM: 'B_NEEDS_SYSTEM',
  C_NEEDS_AUTOMATION: 'C_NEEDS_AUTOMATION',
  D_NEEDS_ECOMMERCE: 'D_NEEDS_ECOMMERCE',
  E_SCALE: 'E_SCALE',
} as const
export type OpportunityType = (typeof OpportunityType)[keyof typeof OpportunityType]

// Temperatura por score
export const SCORE_TEMPERATURE_THRESHOLDS = {
  COLD_MAX: 3,
  WARM_MAX: 7,
  HOT_MIN: 8,
} as const

// ─── UI Display Maps ───

export const COLLECTION_JOB_STATUS_MAP: Record<CollectionJobStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  [CollectionJobStatus.PENDING]: { label: 'Na fila', variant: 'secondary' },
  [CollectionJobStatus.RUNNING]: { label: 'Coletando', variant: 'default' },
  [CollectionJobStatus.COMPLETED]: { label: 'Concluída', variant: 'outline' },
  [CollectionJobStatus.FAILED]: { label: 'Falhou', variant: 'destructive' },
  [CollectionJobStatus.PAUSED]: { label: 'Pausada', variant: 'secondary' },
  [CollectionJobStatus.PARTIAL]: { label: 'Parcial', variant: 'outline' },
  [CollectionJobStatus.CANCELLED]: { label: 'Cancelada', variant: 'secondary' },
}

export const LEAD_STATUS_MAP: Record<LeadStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  [LeadStatus.NEW]: { label: 'Novo', variant: 'default' },
  [LeadStatus.CONTACTED]: { label: 'Contatado', variant: 'secondary' },
  [LeadStatus.NEGOTIATING]: { label: 'Em Negociação', variant: 'default' },
  [LeadStatus.CONVERTED]: { label: 'Convertido', variant: 'outline' },
  [LeadStatus.DISCARDED]: { label: 'Descartado', variant: 'secondary' },
  [LeadStatus.DISQUALIFIED]: { label: 'Desqualificado', variant: 'destructive' },
  [LeadStatus.FALSE_POSITIVE]: { label: 'Falso Positivo', variant: 'destructive' },
  [LeadStatus.ENRICHMENT_PENDING]: { label: 'Enriquecimento Pendente', variant: 'secondary' },
}

export const INVITE_STATUS_MAP: Record<InviteStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  [InviteStatus.PENDING]: { label: 'Pendente', variant: 'default' },
  [InviteStatus.ACCEPTED]: { label: 'Aceito', variant: 'outline' },
  [InviteStatus.REVOKED]: { label: 'Revogado', variant: 'destructive' },
  [InviteStatus.EXPIRED]: { label: 'Expirado', variant: 'secondary' },
}

export const LEAD_TEMPERATURE_MAP: Record<LeadTemperature, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  [LeadTemperature.COLD]: { label: 'Frio', variant: 'secondary' },
  [LeadTemperature.WARM]: { label: 'Morno', variant: 'default' },
  [LeadTemperature.HOT]: { label: 'Quente', variant: 'destructive' },
}

export const OPPORTUNITY_TYPE_MAP: Record<OpportunityType, { label: string }> = {
  [OpportunityType.A_NEEDS_SITE]: { label: 'Precisa de site' },
  [OpportunityType.B_NEEDS_SYSTEM]: { label: 'Precisa de sistema' },
  [OpportunityType.C_NEEDS_AUTOMATION]: { label: 'Precisa de automação' },
  [OpportunityType.D_NEEDS_ECOMMERCE]: { label: 'Precisa de e-commerce' },
  [OpportunityType.E_SCALE]: { label: 'Precisa escalar' },
}

// ─── Backward Compatibility Aliases ───
// Existing front-end code uses these names — keep until migration complete
export const JobStatus = CollectionJobStatus
export type JobStatus = CollectionJobStatus
export const JOB_STATUS_MAP = COLLECTION_JOB_STATUS_MAP

export const CredentialProvider = {
  GOOGLE_PLACES: 'GOOGLE_PLACES',
  OUTSCRAPER: 'OUTSCRAPER',
  APIFY: 'APIFY',
  OPENAI: 'OPENAI',
  ANTHROPIC: 'ANTHROPIC',
  HERE_MAPS: 'HERE_MAPS',
  TOMTOM: 'TOMTOM',
  CUSTOM: 'CUSTOM',
} as const
export type CredentialProvider = (typeof CredentialProvider)[keyof typeof CredentialProvider]

export const CREDENTIAL_PROVIDER_MAP: Record<CredentialProvider, { label: string }> = {
  [CredentialProvider.GOOGLE_PLACES]: { label: 'Google Places' },
  [CredentialProvider.OUTSCRAPER]: { label: 'Outscraper' },
  [CredentialProvider.APIFY]: { label: 'Apify' },
  [CredentialProvider.OPENAI]: { label: 'OpenAI' },
  [CredentialProvider.ANTHROPIC]: { label: 'Anthropic' },
  [CredentialProvider.HERE_MAPS]: { label: 'HERE Maps' },
  [CredentialProvider.TOMTOM]: { label: 'TomTom' },
  [CredentialProvider.CUSTOM]: { label: 'Personalizado' },
}
