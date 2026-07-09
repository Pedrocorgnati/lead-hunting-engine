/*
## Lead Tasks Panel
*/
'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Circle, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

interface LeadTask { id: string; title: string; dueAt: string | null; completed: boolean }
interface TasksResponse { data?: { tasks: LeadTask[] }; error?: { code: string; message: string } }

export interface LeadTasksPanelProps { leadId: string }

export function LeadTasksPanel({ leadId }: LeadTasksPanelProps) {
  const [tasks, setTasks] = useState<LeadTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newDueAt, setNewDueAt] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/v1/leads/${leadId}/tasks`)
      const json = (await res.json().catch(() => ({}))) as TasksResponse
      if (!res.ok) { setError(json.error?.message ?? 'Erro ao carregar tasks.'); return }
      setTasks(json.data?.tasks ?? [])
    } catch { setError('Erro de rede.') } finally { setLoading(false) }
  }, [leadId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  async function handleAdd() {
    if (!newTitle.trim()) return
    setAdding(true)
    try {
      const res = await fetch(`/api/v1/leads/${leadId}/tasks`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          ...(newDueAt ? { dueAt: newDueAt } : {}),
        }),
      })
      if (!res.ok) { toast.error('Erro ao criar reminder.'); return }
      toast.success('Reminder criado.')
      setNewTitle('')
      setNewDueAt('')
      await load()
    } catch { toast.error('Erro de rede.') } finally { setAdding(false) }
  }

  async function deleteTask(taskId: string) {
    if (removingId) return
    setRemovingId(taskId)
    try {
      const res = await fetch(`/api/v1/leads/${leadId}/tasks/${taskId}`, {
        method: 'DELETE',
      })
      if (!res.ok) { toast.error('Erro ao remover reminder.'); return }
      toast.success('Reminder removido.')
      await load()
    } catch { toast.error('Erro de rede.') } finally { setRemovingId(null) }
  }

  async function toggleTask(id: string, current: boolean) {
    try {
      const res = await fetch(`/api/v1/leads/${leadId}/tasks/${id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ completed: !current }),
      })
      if (!res.ok) { toast.error('Erro ao atualizar.'); return }
      setTasks((prev) => prev.map((t) => t.id === id ? { ...t, completed: !current } : t))
    } catch { toast.error('Erro de rede.') }
  }

  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1
    if (!a.dueAt && !b.dueAt) return 0
    if (!a.dueAt) return 1
    if (!b.dueAt) return -1
    return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
  })

  return (
    <div className="space-y-3" data-testid={`lead-tasks-panel-${leadId}`}>
      <div className="flex items-center gap-2">
        <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Novo reminder..." className="text-sm h-8" onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd() }} />
        <Input
          type="date"
          value={newDueAt}
          onChange={(e) => setNewDueAt(e.target.value)}
          title="Data de vencimento"
          className="h-8 text-sm max-w-40"
          aria-label="Data de vencimento do reminder"
          onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd() }}
        />
        <Button size="sm" variant="outline" onClick={() => void handleAdd()} disabled={adding || !newTitle.trim()} aria-label="Adicionar reminder">
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
        </Button>
      </div>
      {loading && <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" /></div>}
      {!loading && error && <div role="alert" className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />{error}</div>}
      {!loading && !error && sortedTasks.length === 0 && <p role="status" className="text-xs text-muted-foreground">Nenhum reminder criado.</p>}
      {!loading && !error && sortedTasks.length > 0 && (
        <ul className="space-y-1">
          {sortedTasks.map((task) => (
            <li key={task.id} className="flex items-center gap-2" data-testid={`task-${task.id}`}>
              <button type="button" onClick={() => void toggleTask(task.id, task.completed)} aria-label={task.completed ? 'Marcar pendente' : 'Marcar concluido'} className="shrink-0 text-muted-foreground hover:text-emerald-600">
                {task.completed ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Circle className="h-4 w-4" aria-hidden="true" />}
              </button>
              <span className={`text-xs ${task.completed ? 'line-through text-muted-foreground' : ''}`}>{task.title}</span>
              {task.dueAt && <span className="text-xs text-muted-foreground ml-auto">{new Date(task.dueAt).toLocaleDateString('pt-BR')}</span>}
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9"
                disabled={removingId === task.id}
                onClick={() => {
                  if (window.confirm('Remover reminder?')) void deleteTask(task.id)
                }}
                aria-label="Remover reminder"
                title="Remover reminder"
              >
                {removingId === task.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
