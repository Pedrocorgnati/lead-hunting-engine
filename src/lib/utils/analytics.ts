export type AnalyticsEvent =
  | 'login'
  | 'logout'
  | 'collection_started'
  | 'collection_completed'
  | 'lead_viewed'
  | 'lead_status_changed'
  | 'pitch_generated'
  | 'pitch_copied'
  | 'csv_exported'
  | 'invite_sent'
  | 'credential_saved'
  | 'credential_tested'
  | 'credential_deleted'
  | 'scoring_updated'
  | 'admin_metrics_viewed'
  | 'false_positive_marked'
  | 'radar_triggered'
  | 'budget_flow_redirect'
  // Onboarding (M7-G03 / TASK-6) — sem PII em payloads
  | 'onboarding_started'
  | 'onboarding_step_completed'
  | 'onboarding_skipped'
  | 'onboarding_completed'
  | 'onboarding_first_collection_dispatched'

export function trackEvent(
  event: AnalyticsEvent,
  properties?: Record<string, string | number | boolean>
): void {
  if (typeof window !== 'undefined' && 'va' in window) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).va('event', event, properties)
  }
  if (process.env.NODE_ENV === 'development') {
    console.log('[analytics]', event, properties)
  }
}
