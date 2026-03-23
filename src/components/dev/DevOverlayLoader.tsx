'use client'

import dynamic from 'next/dynamic'

const DevDataTestOverlay = dynamic(
  () => import('@/components/dev/DataTestOverlay').then((mod) => mod.DevDataTestOverlay),
  { ssr: false }
)

export function DevOverlayLoader() {
  if (process.env.NODE_ENV !== 'development') return null
  return <DevDataTestOverlay />
}
