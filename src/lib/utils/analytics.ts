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
  | 'scoring_updated'
  | 'false_positive_marked'
  | 'radar_triggered'
  | 'budget_flow_redirect'

export function trackEvent(
  event: AnalyticsEvent,
  properties?: Record<string, string | number | boolean>
): void {
  if (typeof window !== 'undefined' && 'va' in window) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).va('event', event, properties)
  }
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.log('[analytics]', event, properties)
  }
}
