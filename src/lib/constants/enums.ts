export enum UserRole {
  ADMIN = 'ADMIN',
  OPERATOR = 'OPERATOR',
}

export enum InviteStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REVOKED = 'REVOKED',
  EXPIRED = 'EXPIRED',
}

export enum JobStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum LeadStatus {
  NEW = 'NEW',
  CONTACTED = 'CONTACTED',
  QUALIFIED = 'QUALIFIED',
  DISQUALIFIED = 'DISQUALIFIED',
  CONVERTED = 'CONVERTED',
}

export enum LeadType {
  A = 'A',
  B = 'B',
  C = 'C',
}

export enum CredentialProvider {
  GOOGLE_PLACES = 'GOOGLE_PLACES',
  OUTSCRAPER = 'OUTSCRAPER',
  APIFY = 'APIFY',
  OPENAI = 'OPENAI',
  ANTHROPIC = 'ANTHROPIC',
}

// Status maps for UI display
export const JOB_STATUS_MAP: Record<JobStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  [JobStatus.PENDING]: { label: 'Na fila', variant: 'secondary' },
  [JobStatus.RUNNING]: { label: 'Coletando', variant: 'default' },
  [JobStatus.COMPLETED]: { label: 'Concluída', variant: 'outline' },
  [JobStatus.FAILED]: { label: 'Falhou', variant: 'destructive' },
  [JobStatus.CANCELLED]: { label: 'Cancelada', variant: 'secondary' },
}

export const LEAD_TYPE_MAP: Record<LeadType, { label: string }> = {
  [LeadType.A]: { label: 'Tipo A' },
  [LeadType.B]: { label: 'Tipo B' },
  [LeadType.C]: { label: 'Tipo C' },
}

export const LEAD_STATUS_MAP: Record<LeadStatus, { label: string }> = {
  [LeadStatus.NEW]: { label: 'Novo' },
  [LeadStatus.CONTACTED]: { label: 'Contatado' },
  [LeadStatus.QUALIFIED]: { label: 'Qualificado' },
  [LeadStatus.DISQUALIFIED]: { label: 'Desqualificado' },
  [LeadStatus.CONVERTED]: { label: 'Convertido' },
}

export const INVITE_STATUS_MAP: Record<InviteStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  [InviteStatus.PENDING]: { label: 'Pendente', variant: 'default' },
  [InviteStatus.ACCEPTED]: { label: 'Aceito', variant: 'outline' },
  [InviteStatus.REVOKED]: { label: 'Revogado', variant: 'destructive' },
  [InviteStatus.EXPIRED]: { label: 'Expirado', variant: 'secondary' },
}

export const CREDENTIAL_PROVIDER_MAP: Record<CredentialProvider, { label: string }> = {
  [CredentialProvider.GOOGLE_PLACES]: { label: 'Google Places' },
  [CredentialProvider.OUTSCRAPER]: { label: 'Outscraper' },
  [CredentialProvider.APIFY]: { label: 'Apify' },
  [CredentialProvider.OPENAI]: { label: 'OpenAI' },
  [CredentialProvider.ANTHROPIC]: { label: 'Anthropic' },
}

export const LIMITS = {
  INVITE_EXPIRY_DAYS: 7,
  MAX_JOBS_PER_USER: 10,
  MAX_NOTES_LENGTH: 2000,
  MAX_CSV_ROWS: 10000,
} as const
