import type {
  UserRole, InviteStatus, CollectionJobStatus, DataSource,
  LeadStatus, LeadTemperature, OpportunityType
} from '@/lib/constants/enums'

export interface UserProfileDto {
  id: string
  email: string
  name: string
  role: UserRole
  avatarUrl?: string
  termsAcceptedAt?: string
  createdAt: string
}

export interface InviteDto {
  id: string
  email: string
  role: UserRole
  status: InviteStatus
  expiresAt: string
  acceptedAt?: string
  createdAt: string
}

export interface CollectionJobDto {
  id: string
  userId: string
  name?: string
  status: CollectionJobStatus
  city: string
  state?: string
  country: string
  niche: string
  sources: DataSource[]
  limitVal?: number
  totalEstimated?: number
  processedLeads: number
  currentSource?: string
  startedAt?: string
  completedAt?: string
  createdAt: string
}

/** Formato usado pela UI de coletas (server actions + frontend) */
export interface CollectionJobSummary {
  id: string
  name: string
  query: string
  location: string
  status: CollectionJobStatus
  progress: number
  resultCount: number
  maxResults: number
  createdAt: string
  errorMessage?: string
}

export interface LeadSummary {
  id: string
  businessName: string
  city?: string
  state?: string
  category?: string
  score: number
  temperature: LeadTemperature
  status: LeadStatus
  opportunities: OpportunityType[]
  instagramFollowers?: number
  rating?: number
  reviewCount?: number
  createdAt: string
}

export interface LeadDetailDto extends LeadSummary {
  phone?: string
  address?: string
  website?: string
  email?: string
  instagramHandle?: string
  facebookUrl?: string
  problems: string[]
  suggestions: string[]
  pitchContent?: string
  pitchTone?: string
  notes?: string
  contactedAt?: string
  falsePositiveReason?: string
  updatedAt: string
}

export interface ScoreBreakdown {
  criterion: string
  slug: string
  weight: number
  earned: number
  description: string
}

export interface DataProvenanceDto {
  field: string
  source: DataSource
  sourceUrl?: string
  collectedAt: string
  confidence: number
}

export interface ScoringRuleDto {
  id: string
  name: string
  slug: string
  description?: string
  weight: number
  isActive: boolean
  condition: Record<string, unknown>
  sortOrder: number
}

export interface ApiCredentialDto {
  provider: string
  isActive: boolean
  usageCount: number
  usageResetAt?: string
  createdAt: string
}

export interface PitchTemplateDto {
  id: string
  name: string
  content: string
  tone: string
  isFavorite: boolean
  createdAt: string
}

// ─── module-14: Lead Dashboard ────────────────────────────────
export interface ProvenanceEntry {
  id: string
  field: string
  source: string
  sourceUrl?: string
  collectedAt: string
  confidence: number
}

export interface LeadDashboardKpis {
  totalLeads: number
  hotLeads: number
  warmLeads: number
  coldLeads: number
  convertedLeads: number
  conversionRate: number
  activeJobs: number
}
