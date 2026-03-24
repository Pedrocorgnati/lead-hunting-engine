export const QueryKeys = {
  LEADS: 'leads',
  LEAD: (id: string) => ['leads', id] as const,
  LEAD_NOTES: (id: string) => ['leads', id, 'notes'] as const,
  LEAD_PITCH: (id: string) => ['leads', id, 'pitch'] as const,
  JOBS: 'jobs',
  JOB: (id: string) => ['jobs', id] as const,
  JOB_STATUS: (id: string) => ['jobs', id, 'status'] as const,
  INVITES: 'invites',
  CREDENTIALS: 'credentials',
  SCORING_RULES: 'scoring-rules',
  PROFILE: 'profile',
  METRICS: 'metrics',
} as const
