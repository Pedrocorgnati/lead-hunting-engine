export type DiffKind = 'added' | 'removed' | 'modified' | 'unchanged'

export interface DiffLine {
  key: string
  kind: DiffKind
  left?: unknown
  right?: unknown
}

/** Shallow diff between two plain objects. Returns one entry per top-level key. */
export function diffObjects(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): DiffLine[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  const lines: DiffLine[] = []

  for (const key of keys) {
    const hasA = Object.prototype.hasOwnProperty.call(a, key)
    const hasB = Object.prototype.hasOwnProperty.call(b, key)
    if (!hasA) {
      lines.push({ key, kind: 'added', right: b[key] })
    } else if (!hasB) {
      lines.push({ key, kind: 'removed', left: a[key] })
    } else if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
      lines.push({ key, kind: 'modified', left: a[key], right: b[key] })
    } else {
      lines.push({ key, kind: 'unchanged', left: a[key], right: b[key] })
    }
  }
  return lines
}

/** Convenience wrapper for scoring rule objects. */
export function diffRules(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): DiffLine[] {
  return diffObjects(a, b)
}
