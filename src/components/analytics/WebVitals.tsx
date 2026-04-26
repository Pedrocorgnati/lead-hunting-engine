'use client'

import { useReportWebVitals } from 'next/web-vitals'
import { trackEvent } from '@/lib/observability/analytics'

/**
 * TASK-1/ST007 (CL-306): encaminha LCP/CLS/INP/FCP/TTFB para GA4/Plausible
 * via `trackEvent`. Em dev, loga no console para debug.
 */
export function WebVitals() {
  useReportWebVitals((metric) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[web-vitals]', metric.name, metric.value, metric.rating)
    }
    trackEvent('web_vital', {
      metric_name: metric.name,
      metric_value: Math.round(metric.value),
      metric_rating: metric.rating,
      metric_delta: Math.round(metric.delta),
      metric_id: metric.id,
    })
  })
  return null
}
