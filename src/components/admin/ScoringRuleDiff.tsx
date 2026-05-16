'use client'

import { useState } from 'react'
import { diffRules, type DiffLine } from '@/lib/diff/json-diff'

function kindStyles(kind: DiffLine['kind']): string {
  switch (kind) {
    case 'added': return 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300'
    case 'removed': return 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300'
    case 'modified': return 'bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300'
    default: return 'bg-muted/30'
  }
}

function Cell({ value, kind, side }: { value: unknown; kind: DiffLine['kind']; side: 'left' | 'right' }) {
  if (kind === 'added' && side === 'left') return <td className="px-3 py-1.5 text-xs text-muted-foreground">—</td>
  if (kind === 'removed' && side === 'right') return <td className="px-3 py-1.5 text-xs text-muted-foreground">—</td>
  return (
    <td className={`px-3 py-1.5 text-xs font-mono ${kindStyles(kind)}`}>
      {JSON.stringify(value)}
    </td>
  )
}

interface Props {
  versionA: { label: string; data: Record<string, unknown> }
  versionB: { label: string; data: Record<string, unknown> }
}

export function ScoringRuleDiff({ versionA, versionB }: Props) {
  const lines = diffRules(versionA.data, versionB.data)
  const changed = lines.filter((l) => l.kind !== 'unchanged')

  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Adicionado</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Removido</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />Modificado</span>
      </div>

      {changed.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">Versões idênticas.</p>
      )}

      {changed.length > 0 && (
        <div className="overflow-x-auto rounded border">
          <table className="w-full text-sm" role="table" aria-label="Diff de regras de scoring">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium w-1/4">Campo</th>
                <th className="px-3 py-2 text-left font-medium w-1/3">{versionA.label}</th>
                <th className="px-3 py-2 text-left font-medium w-1/3">{versionB.label}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.key} className={`border-b last:border-0 ${kindStyles(line.kind)}`}>
                  <td className="px-3 py-1.5 text-xs font-medium">{line.key}</td>
                  <Cell value={line.left} kind={line.kind} side="left" />
                  <Cell value={line.right} kind={line.kind} side="right" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

interface VersionPickerProps {
  versions: Array<{ id: string; label: string; data: Record<string, unknown> }>
}

export function ScoringRuleDiffPicker({ versions }: VersionPickerProps) {
  const [leftIdx, setLeftIdx] = useState(0)
  const [rightIdx, setRightIdx] = useState(Math.min(1, versions.length - 1))

  if (versions.length < 2) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        Apenas uma versão disponível — nada a comparar.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <label className="text-sm font-medium" htmlFor="diff-left">Versão A</label>
        <select
          id="diff-left"
          value={leftIdx}
          onChange={(e) => setLeftIdx(Number(e.target.value))}
          className="rounded border bg-background px-2 py-1 text-sm"
        >
          {versions.map((v, i) => (
            <option key={v.id} value={i}>{v.label}</option>
          ))}
        </select>
        <label className="text-sm font-medium" htmlFor="diff-right">Versão B</label>
        <select
          id="diff-right"
          value={rightIdx}
          onChange={(e) => setRightIdx(Number(e.target.value))}
          className="rounded border bg-background px-2 py-1 text-sm"
        >
          {versions.map((v, i) => (
            <option key={v.id} value={i}>{v.label}</option>
          ))}
        </select>
      </div>
      <ScoringRuleDiff versionA={versions[leftIdx]} versionB={versions[rightIdx]} />
    </div>
  )
}
