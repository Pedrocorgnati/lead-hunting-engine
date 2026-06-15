'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  LayoutDashboard,
  Users,
  Database,
  FileText,
  Download,
  Bell,
  User,
  Shield,
  Plus,
  Radar,
  CornerDownLeft,
  type LucideIcon,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/hooks/use-auth'

interface SearchResult {
  id: string
  title: string
  subtitle?: string
  href: string
  kind: 'lead' | 'job' | 'template'
}

interface Command {
  id: string
  label: string
  group: string
  icon: LucideIcon
  keywords?: string
  shortcut?: string
  href?: string
  run?: () => void
  adminOnly?: boolean
}

type Row =
  | { kind: 'command'; group: string; command: Command }
  | { kind: 'result'; group: string; result: SearchResult }

const RESULT_GROUP: Record<SearchResult['kind'], string> = {
  lead: 'Leads',
  job: 'Coletas',
  template: 'Templates',
}

export function GlobalSearch() {
  const router = useRouter()
  const { isAdmin } = useAuth()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  // Navegacao para uma rota fecha o palette e limpa o estado.
  const navigate = useCallback(
    (href: string) => {
      setOpen(false)
      setQuery('')
      router.push(href)
    },
    [router],
  )

  // Comandos locais seguros (apenas navegacao). Filtrados por role.
  const commands = useMemo<Command[]>(
    () => [
      { id: 'go-dashboard', label: 'Ir para o Dashboard', group: 'Navegacao', icon: LayoutDashboard, keywords: 'inicio home painel', href: '/dashboard' },
      { id: 'go-leads', label: 'Ver Leads', group: 'Navegacao', icon: Users, keywords: 'contatos empresas prospects', href: '/leads' },
      { id: 'new-coleta', label: 'Nova Coleta', group: 'Acoes', icon: Plus, keywords: 'criar coletar scraping job', href: '/coletas/nova' },
      { id: 'go-coletas', label: 'Ver Coletas', group: 'Navegacao', icon: Database, keywords: 'jobs scraping execucoes', href: '/coletas' },
      { id: 'go-radar', label: 'Abrir Radar', group: 'Navegacao', icon: Radar, keywords: 'oportunidades monitor', href: '/radar' },
      { id: 'go-templates', label: 'Templates de Pitch', group: 'Navegacao', icon: FileText, keywords: 'mensagens abordagem pitch', href: '/templates/pitch' },
      { id: 'go-export', label: 'Exportar Dados', group: 'Acoes', icon: Download, keywords: 'download csv exportacao', href: '/exportar' },
      { id: 'go-export-historico', label: 'Historico de Exportacoes', group: 'Navegacao', icon: Download, keywords: 'exportacoes anteriores baixar novamente', href: '/exportar/historico' },
      { id: 'go-budgetflow', label: 'Enviar para BudgetFlow', group: 'Acoes', icon: Download, keywords: 'budgetflow push enviar leads', href: '/exportar/budgetflow' },
      { id: 'go-duplicatas', label: 'Duplicatas de Leads', group: 'Navegacao', icon: Users, keywords: 'duplicados merge dedup', href: '/leads/duplicatas' },
      { id: 'go-comparar', label: 'Comparar Leads', group: 'Navegacao', icon: Users, keywords: 'comparacao lado a lado', href: '/leads/comparar' },
      { id: 'go-notifications', label: 'Notificacoes', group: 'Navegacao', icon: Bell, keywords: 'alertas avisos', href: '/notifications' },
      { id: 'go-notif-prefs', label: 'Preferencias de Notificacao', group: 'Navegacao', icon: Bell, keywords: 'canais eventos nao perturbe dnd', href: '/notificacoes/preferencias' },
      { id: 'go-perfil', label: 'Meu Perfil', group: 'Navegacao', icon: User, keywords: 'conta configuracoes usuario', href: '/perfil' },
      { id: 'go-perfil-seguranca', label: 'Seguranca da Conta', group: 'Navegacao', icon: Shield, keywords: 'senha trocar seguranca sessoes', href: '/perfil/seguranca' },
      { id: 'go-admin', label: 'Painel Admin', group: 'Admin', icon: Shield, keywords: 'administracao gestao', href: '/admin', adminOnly: true },
      { id: 'go-operadores', label: 'Operadores', group: 'Admin', icon: Users, keywords: 'usuarios equipe operadores', href: '/admin/operadores', adminOnly: true },
      { id: 'go-metricas', label: 'Metricas', group: 'Admin', icon: LayoutDashboard, keywords: 'estatisticas relatorios metricas', href: '/admin/metricas', adminOnly: true },
      { id: 'go-admin-jobs', label: 'Fila de Jobs (admin)', group: 'Admin', icon: Database, keywords: 'fila jobs coletas retry cancelar', href: '/admin/jobs/fila', adminOnly: true },
      { id: 'go-admin-cron', label: 'Cron Jobs (admin)', group: 'Admin', icon: Database, keywords: 'rotinas agendadas cron scheduler', href: '/admin/jobs/cron', adminOnly: true },
      { id: 'go-admin-credenciais', label: 'Credenciais e provedores (admin)', group: 'Admin', icon: Shield, keywords: 'api keys chaves credenciais providers saude status quota', href: '/admin/credenciais', adminOnly: true },
      { id: 'go-admin-classificacao', label: 'Classificacao (admin)', group: 'Admin', icon: FileText, keywords: 'faixas oportunidade badges classificacao', href: '/admin/classificacao', adminOnly: true },
      { id: 'go-admin-flags', label: 'Feature Flags (admin)', group: 'Admin', icon: Shield, keywords: 'flags toggles ambiente', href: '/admin/feature-flags', adminOnly: true },
      { id: 'go-admin-alertas', label: 'Alertas Operacionais (admin)', group: 'Admin', icon: Bell, keywords: 'alertas regras operacional', href: '/admin/alertas', adminOnly: true },
      { id: 'go-admin-api-usage', label: 'Uso de API (admin)', group: 'Admin', icon: LayoutDashboard, keywords: 'consumo custo quota api', href: '/admin/api-usage', adminOnly: true },
      { id: 'go-admin-scoring-versoes', label: 'Versoes de Scoring (admin)', group: 'Admin', icon: FileText, keywords: 'historico versoes scoring snapshot', href: '/admin/scoring/versoes', adminOnly: true },
      { id: 'go-admin-retencao', label: 'Retencao (admin)', group: 'Admin', icon: Shield, keywords: 'retencao expurgo lgpd dados', href: '/admin/retencao', adminOnly: true },
      { id: 'go-admin-dsar', label: 'DSAR (admin)', group: 'Admin', icon: Shield, keywords: 'titulares lgpd requisicoes dsar', href: '/admin/dsar', adminOnly: true },
    ],
    [],
  )

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase()
    return commands.filter((c) => {
      if (c.adminOnly && !isAdmin) return false
      if (!q) return true
      return (
        c.label.toLowerCase().includes(q) ||
        (c.keywords ?? '').toLowerCase().includes(q)
      )
    })
  }, [commands, query, isAdmin])

  // Atalho global Ctrl/Cmd+K para abrir/fechar.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Busca remota preservada: GET /api/v1/search, debounce 200ms, minimo 2 chars.
  const search = useCallback(async (q: string) => {
    if (!q || q.length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}`)
      if (res.ok) {
        const json = await res.json()
        setResults(json.data ?? [])
      } else {
        setResults([])
      }
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void search(query), 200)
    return () => clearTimeout(t)
  }, [query, search])

  // Reset de estado ao abrir.
  useEffect(() => {
    if (open) {
      setActiveIndex(0)
    } else {
      setQuery('')
      setResults([])
    }
  }, [open])

  // Lista plana (comandos + resultados) na mesma ordem de renderizacao.
  const rows = useMemo<Row[]>(() => {
    const cmdRows: Row[] = filteredCommands.map((command) => ({
      kind: 'command',
      group: command.group,
      command,
    }))
    const resultRows: Row[] = results.map((result) => ({
      kind: 'result',
      group: RESULT_GROUP[result.kind],
      result,
    }))
    return [...cmdRows, ...resultRows]
  }, [filteredCommands, results])

  // Mantem activeIndex dentro dos limites quando a lista muda.
  useEffect(() => {
    setActiveIndex((i) => (rows.length === 0 ? 0 : Math.min(i, rows.length - 1)))
  }, [rows.length])

  // Scroll do item ativo para a area visivel.
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-row-index="${activeIndex}"]`,
    )
    node?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const execute = useCallback(
    (row: Row | undefined) => {
      if (!row) return
      if (row.kind === 'command') {
        if (row.command.run) {
          setOpen(false)
          setQuery('')
          row.command.run()
        } else if (row.command.href) {
          navigate(row.command.href)
        }
      } else {
        navigate(row.result.href)
      }
    },
    [navigate],
  )

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (rows.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % rows.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + rows.length) % rows.length)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActiveIndex(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActiveIndex(rows.length - 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      execute(rows[activeIndex])
    }
  }

  // Renderiza linhas com cabecalhos de grupo, preservando o indice plano.
  let lastGroup: string | null = null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="sr-only">Paleta de comandos</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Buscar ou executar um comando... (Ctrl+K)"
            className="border-0 focus-visible:ring-0"
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls="command-palette-list"
            aria-activedescendant={
              rows.length > 0 ? `command-palette-row-${activeIndex}` : undefined
            }
          />
        </div>
        <div
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          aria-label="Comandos e resultados"
          className="max-h-80 overflow-auto py-1"
        >
          {loading && (
            <p className="px-3 py-2 text-sm text-muted-foreground">Buscando...</p>
          )}

          {rows.length === 0 && !loading && (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              {query.length >= 2
                ? 'Nenhum resultado ou comando.'
                : 'Nenhum comando disponivel.'}
            </p>
          )}

          {rows.map((row, index) => {
            const header =
              row.group !== lastGroup ? (
                <p
                  key={`header-${row.group}-${index}`}
                  className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {row.group}
                </p>
              ) : null
            lastGroup = row.group

            const isActive = index === activeIndex
            const Icon = row.kind === 'command' ? row.command.icon : Search
            const label =
              row.kind === 'command' ? row.command.label : row.result.title
            const subtitle =
              row.kind === 'command'
                ? undefined
                : row.result.subtitle
            const shortcut =
              row.kind === 'command' ? row.command.shortcut : undefined

            return (
              <div key={`group-block-${index}`}>
                {header}
                <button
                  type="button"
                  id={`command-palette-row-${index}`}
                  data-row-index={index}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => execute(row)}
                  onMouseMove={() => setActiveIndex(index)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${
                    isActive ? 'bg-muted' : 'hover:bg-muted/60'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{label}</span>
                    {subtitle && (
                      <span className="truncate text-xs text-muted-foreground">
                        {subtitle}
                      </span>
                    )}
                  </span>
                  {shortcut && (
                    <kbd className="ml-auto rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {shortcut}
                    </kbd>
                  )}
                  {isActive && !shortcut && (
                    <CornerDownLeft className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
