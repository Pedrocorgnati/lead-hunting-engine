'use client'

import { GlobalSearch } from './GlobalSearch'

/**
 * Mounts global keyboard shortcut handlers. Currently exposes Ctrl+K search.
 * Keep additional shortcuts centralized here.
 */
export function KeyboardShortcuts() {
  return <GlobalSearch />
}
