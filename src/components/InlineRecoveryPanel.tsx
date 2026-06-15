'use client'

/**
 * Task 25 / A15.4 (loop 05-27-lead-hunting-engine-explained):
 * InlineRecoveryPanel - painel de recuperacao operacional para erros de provider.
 *
 * Renderiza, a partir do health operacional de UM provider (resposta de
 * GET /api/v1/admin/providers/status), os campos canonicos de status
 * (status, latencyMs, quotaRemaining, rateLimitResetAt, lastError,
 * fallbackProvider, updatedAt) e as acoes de recuperacao contextuais para as
 * quatro classes de falha: credencial invalida, quota esgotada, rate-limit e
 * provider fora do ar (PAUSED/DOWN).
 *
 * Acoes reais (sem orfaos, sem silencio):
 *  - Testar credencial -> POST /api/v1/admin/config/credentials/:provider/test
 *  - Abrir jobs filtrados -> /admin/jobs/fila (destino real, sem deadend)
 *  - Pausar / Retomar provider -> POST /api/v1/admin/providers/:provider/{pause,resume}
 *  - Acionar fallback -> POST /api/v1/admin/providers/:provider/force-fallback
 *
 * Operacoes sensiveis (pause/resume/force-fallback) exigem reautenticacao: o
 * painel obtem um reauthId via POST /api/v1/auth/reauth com o escopo exato
 * `admin.providers:<source>:<operation>` antes de chamar a operacao, conforme o
 * contrato de _provider-operations.ts (A15.3). Toda acao gera um correlationId
 * proprio e expoe loading, sucesso e erro com regiao aria-live.
 *
 * Telas alvo: AD6 /admin/credenciais, AD7 teste de credencial,
 * AD19 /admin/provedores, G15, G16.
 */

import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FlaskConical,
  Loader2,
  PauseCircle,
  PlayCircle,
  Shuffle,
} from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/lib/hooks/use-toast'
import { cn } from '@/lib/utils'

type ProviderStatus = 'UP' | 'DEGRADED' | 'DOWN' | 'PAUSED' | 'UNCONFIGURED'

/**
 * Espelha o ProviderHealthItem de GET /api/v1/admin/providers/status. Mantido
 * local porque o tipo da rota nao e exportado; os campos sao o contrato de
 * aceite desta task (status + 6 metricas + updatedAt).
 */
export interface ProviderHealth {
  source: string
  label: string
  status: ProviderStatus
  latencyMs: number | null
  quotaRemaining: number | null
  rateLimitResetAt: string | null
  lastError: string | null
  fallbackProvider: string | null
  updatedAt: string
}

export interface InlineRecoveryPanelProps {
  health: ProviderHealth
  /** Disparado apos uma acao de recuperacao bem-sucedida, para o pai recarregar o status. */
  onRecovered?: (correlationId: string) => void
  credentialSummary?: ReactNode
  credentialActions?: ReactNode
  className?: string
}

type SensitiveOperation = 'pause' | 'resume' | 'force-fallback'

interface ActionFeedback {
  tone: 'success' | 'error'
  message: string
  correlationId: string
}

const STATUS_BADGE: Record<ProviderStatus, { label: string; className: string }> = {
  UP: {
    label: 'Operacional',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300',
  },
  DEGRADED: {
    label: 'Degradado',
    className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300',
  },
  DOWN: {
    label: 'Fora do ar',
    className: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-300',
  },
  PAUSED: {
    label: 'Pausado',
    className: 'border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-900/60 dark:bg-yellow-950/30 dark:text-yellow-300',
  },
  UNCONFIGURED: {
    label: 'Não configurado',
    className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300',
  },
}

const PANEL_TONE = {
  success: {
    panel: 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/10',
    icon: 'text-emerald-600 dark:text-emerald-400',
    diagnostics: 'text-emerald-700 dark:text-emerald-300',
  },
  attention: {
    panel: 'border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/10',
    icon: 'text-amber-600 dark:text-amber-400',
    diagnostics: 'text-amber-800 dark:text-amber-300',
  },
  warning: {
    panel: 'border-yellow-200 bg-yellow-50/50 dark:border-yellow-900/50 dark:bg-yellow-950/10',
    icon: 'text-yellow-600 dark:text-yellow-400',
    diagnostics: 'text-yellow-800 dark:text-yellow-300',
  },
  outage: {
    panel: 'border-orange-200 bg-orange-50/50 dark:border-orange-900/50 dark:bg-orange-950/10',
    icon: 'text-orange-600 dark:text-orange-400',
    diagnostics: 'text-orange-700 dark:text-orange-300',
  },
  danger: {
    panel: 'border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/10',
    icon: 'text-red-600 dark:text-red-400',
    diagnostics: 'text-red-700 dark:text-red-300',
  },
}

const OPERATION_LABEL: Record<SensitiveOperation, string> = {
  pause: 'Pausar provider',
  resume: 'Retomar provider',
  'force-fallback': 'Acionar fallback',
}

const API_KEY_DESTINATIONS: Record<string, string> = {
  GOOGLE_PLACES: 'https://console.cloud.google.com/apis/credentials',
  OUTSCRAPER: 'https://app.outscraper.cloud/account/api',
  APIFY: 'https://console.apify.com/account#/integrations',
  LINKEDIN_COMPANY: 'https://www.linkedin.com/developers/apps',
  HERE_MAPS: 'https://platform.here.com/',
  TOMTOM: 'https://developer.tomtom.com/user/me/apps',
  INSTAGRAM_GRAPH: 'https://developers.facebook.com/apps/',
  INSTAGRAM_APIFY: 'https://console.apify.com/account#/integrations',
  FACEBOOK_GRAPH: 'https://developers.facebook.com/apps/',
  FACEBOOK_INTERMEDIARY: 'https://developers.facebook.com/apps/',
  KIMI: 'https://platform.kimi.ai/console/api-keys',
  OPENAI: 'https://platform.openai.com/api-keys',
  ANTHROPIC: 'https://console.anthropic.com/settings/keys',
}

const PROVIDER_USAGE: Record<string, { title: string; description: string; impact: string; fallback: string }> = {
  GOOGLE_PLACES: {
    title: 'Fonte principal de empresas locais',
    description: 'Busca estabelecimentos reais por cidade, nicho e termo de pesquisa. E a base mais importante para iniciar uma coleta com nome, endereco, categoria, telefone, site e sinais publicos de reputacao.',
    impact: 'Quando esta ativo, o aplicativo encontra leads com melhor cobertura geografica e dados iniciais mais consistentes para deduplicacao, enriquecimento e priorizacao comercial.',
    fallback: 'Se ficar indisponivel, a coleta pode seguir por Outscraper, Apify ou fontes headless, normalmente com menor previsibilidade de custo, latencia ou cobertura.',
  },
  OUTSCRAPER: {
    title: 'Complemento e fallback para buscas locais',
    description: 'Ajuda a obter dados de empresas quando a busca direta por APIs oficiais nao cobre bem uma regiao, categoria ou volume. Tambem pode trazer detalhes adicionais de perfis publicos.',
    impact: 'Aumenta a chance de completar uma coleta quando a fonte principal retorna poucos resultados ou entra em limite temporario.',
    fallback: 'Quando pausado, o sistema tende a depender mais de Google Places, Apify e fontes headless.',
  },
  APIFY: {
    title: 'Token unico para actors e fallbacks Apify',
    description: 'Opera actors de coleta para cenarios em que uma API direta nao e suficiente. Esta credencial unica cobre o provider Apify principal e os fallbacks/intermediarios que rodam sobre Apify, como Instagram (Apify), Facebook Intermediary e LinkedIn Companies.',
    impact: 'Da mais resiliencia ao pipeline, principalmente quando Google Places, Graph APIs ou fontes oficiais falham, nao cobrem um caso ou retornam poucos dados.',
    fallback: 'Se Apify nao estiver disponivel, o sistema perde essa camada de contingencia e passa a depender das APIs diretas ou dos coletores headless internos.',
  },
  APONTADOR: {
    title: 'Diretorio nacional para cobertura adicional',
    description: 'Coleta dados publicos do diretorio Apontador por automacao headless. Serve para ampliar cobertura no Brasil quando APIs primarias nao encontram empresas suficientes.',
    impact: 'Ajuda a preencher lacunas regionais e aumenta diversidade de fontes, mas pode ter mais variacao de latencia e estabilidade que uma API oficial.',
    fallback: 'Normalmente e usado como camada secundaria, depois das fontes mais estaveis.',
  },
  GUIA_MAIS: {
    title: 'Diretorio brasileiro de apoio',
    description: 'Consulta o GuiaMais por automacao headless para localizar empresas, telefones, categorias e sinais publicos complementares.',
    impact: 'Melhora cobertura em nichos locais e apoia coletas quando os provedores principais retornam poucos resultados.',
    fallback: 'Se estiver pausado, a coleta continua pelas outras fontes, mas pode perder algumas oportunidades regionais.',
  },
  LINKEDIN_COMPANY: {
    title: 'Enriquecimento B2B de empresas',
    description: 'Busca sinais corporativos associados a empresas, como presenca institucional, segmento, tamanho percebido e contexto profissional publico.',
    impact: 'Ajuda a qualificar leads B2B e melhora o contexto usado na priorizacao e na preparacao de abordagem comercial.',
    fallback: 'Sem este provider, a coleta ainda encontra empresas, mas com menos contexto profissional para classificacao.',
  },
  HERE_MAPS: {
    title: 'Geocodificacao e normalizacao de endereco',
    description: 'Converte enderecos em coordenadas e ajuda a padronizar localizacao. Nao e uma fonte principal de prospeccao, mas melhora precisao geografica.',
    impact: 'Ajuda filtros por regiao, distancia, cidade e consistencia de dados de endereco.',
    fallback: 'Quando indisponivel, o sistema pode usar outros geocoders, mas a precisao de localizacao pode variar.',
  },
  TOMTOM: {
    title: 'Geocoder alternativo',
    description: 'Funciona como apoio para transformar enderecos em coordenadas e validar localizacoes quando outro geocoder nao responde bem.',
    impact: 'Aumenta confiabilidade em filtros e enriquecimentos baseados em localizacao.',
    fallback: 'Costuma atuar como alternativa ao HERE Maps ou a outros servicos de localizacao.',
  },
  INSTAGRAM_GRAPH: {
    title: 'Dados sociais oficiais do Instagram',
    description: 'Consulta informacoes disponiveis por API oficial para perfis conectados ou publicamente acessiveis dentro das permissoes da plataforma.',
    impact: 'Ajuda a entender presenca digital, atividade social e sinais de marketing do lead.',
    fallback: 'Quando nao cobre um caso, providers intermediarios como Instagram via Apify podem complementar.',
  },
  INSTAGRAM_APIFY: {
    title: 'Fallback social para Instagram',
    description: 'Usa automacao intermediaria para complementar dados sociais quando a API oficial nao cobre o fluxo necessario.',
    impact: 'Aumenta cobertura de enriquecimento social, especialmente para negocios com presenca forte no Instagram.',
    fallback: 'Deve ser tratado como camada complementar, com atencao a custo, limites e estabilidade.',
  },
  FACEBOOK_GRAPH: {
    title: 'Dados oficiais do Facebook',
    description: 'Consulta informacoes permitidas pela API oficial do Facebook para paginas e presencas publicas relevantes ao lead.',
    impact: 'Enriquece a visao de presenca digital e pode apoiar classificacao de maturidade comercial.',
    fallback: 'Quando a API oficial nao cobre o caso, o provider intermediario de Facebook pode ser usado como apoio.',
  },
  FACEBOOK_INTERMEDIARY: {
    title: 'Fallback social para Facebook',
    description: 'Complementa dados de paginas e presenca social em cenarios onde a API oficial nao entrega cobertura suficiente.',
    impact: 'Ajuda a reduzir lacunas no enriquecimento social, mas deve ser monitorado por custo e estabilidade.',
    fallback: 'Normalmente entra depois da Graph API ou quando ha necessidade de contingencia.',
  },
  KIMI: {
    title: 'LLM prioritario para pitch',
    description: 'Usa a API OpenAI-compatible da Kimi/Moonshot para gerar mensagens comerciais e analisar contexto textual dos leads.',
    impact: 'E o primeiro provider tentado na geracao de pitch. Quando esta ativo, reduz dependencia de OpenAI e Anthropic e passa a ser a rota principal de LLM.',
    fallback: 'Se Kimi falhar ou for pausado, o sistema tenta OpenAI e depois Anthropic, conforme a ordem de fallback configurada.',
  },
  OPENAI: {
    title: 'Geracao e apoio de inteligencia textual',
    description: 'Apoia tarefas de linguagem, como geracao de mensagens, interpretacao de contexto e refinamento de textos comerciais.',
    impact: 'Melhora a qualidade das abordagens e ajuda a transformar dados coletados em comunicacao comercial utilizavel.',
    fallback: 'Se estiver indisponivel, Anthropic pode assumir parte das tarefas de LLM conforme configuracao.',
  },
  ANTHROPIC: {
    title: 'LLM alternativo para mensagens e analise',
    description: 'Fornece uma segunda rota de inteligencia textual para geracao de pitch, analise de contexto e apoio a mensagens comerciais.',
    impact: 'Aumenta resiliencia da etapa de geracao de texto e reduz dependencia de um unico fornecedor de LLM.',
    fallback: 'Pode operar como fallback de OpenAI ou como provider principal dependendo da configuracao.',
  },
}

function formatNumber(value: number | null, suffix = ''): string {
  if (value === null || Number.isNaN(value)) return '—'
  return `${value}${suffix}`
}

function formatTimestamp(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('pt-BR')
}

/** Extrai a mensagem de erro do envelope canonico { error: { code, message } }. */
async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } }
    if (body?.error?.message) {
      return body.error.code ? `${body.error.message} (${body.error.code})` : body.error.message
    }
  } catch {
    // corpo nao-JSON: cai no fallback
  }
  return fallback
}

function getProviderUsage(health: ProviderHealth) {
  return PROVIDER_USAGE[health.source] ?? {
    title: `Papel de ${health.label}`,
    description: 'Este provider participa do pipeline de coleta, enriquecimento ou suporte operacional conforme a configuracao do sistema.',
    impact: 'Quando esta configurado e ativo, ajuda o aplicativo a manter cobertura, qualidade de dados ou resiliencia em uma etapa especifica.',
    fallback: health.fallbackProvider
      ? `Se houver indisponibilidade, o sistema pode tentar redirecionar para ${health.fallbackProvider}.`
      : 'Nenhum fallback especifico esta informado para este provider neste momento.',
  }
}

function getApiKeyUrl(source: string) {
  return API_KEY_DESTINATIONS[source] ?? '/docs/admin/credentials-setup.md'
}

function getPanelTone(status: ProviderStatus) {
  if (status === 'UP') return PANEL_TONE.success
  if (status === 'PAUSED') return PANEL_TONE.warning
  if (status === 'UNCONFIGURED') return PANEL_TONE.danger
  if (status === 'DOWN') return PANEL_TONE.outage
  return PANEL_TONE.attention
}

function StatusIcon({ status, className }: { status: ProviderStatus; className?: string }) {
  if (status === 'UP') return <CheckCircle2 className={className} aria-hidden="true" />
  if (status === 'PAUSED') return <PauseCircle className={className} aria-hidden="true" />
  return <AlertTriangle className={className} aria-hidden="true" />
}

export function InlineRecoveryPanel({
  health,
  onRecovered,
  credentialSummary,
  credentialActions,
  className,
}: InlineRecoveryPanelProps) {
  const toast = useToast()
  const liveRegionId = useId()

  const [activeOperation, setActiveOperation] = useState<SensitiveOperation | null>(null)
  const [reason, setReason] = useState('')
  const [password, setPassword] = useState('')
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null)

  // Estavel por mount (lint: funcao impura em render); staleness de ms e irrelevante aqui
  const [now] = useState(() => Date.now())

  const conditions = useMemo(() => {
    const rateLimitResetMs = health.rateLimitResetAt ? new Date(health.rateLimitResetAt).getTime() : null
    const isRateLimited = rateLimitResetMs !== null && !Number.isNaN(rateLimitResetMs) && rateLimitResetMs > now
    const isQuotaExhausted = health.quotaRemaining !== null && health.quotaRemaining <= 0
    const isPaused = health.status === 'PAUSED'
    // H-07: UNCONFIGURED (sem credencial) e distinto de PAUSED (pausa manual).
    const isUnconfigured = health.status === 'UNCONFIGURED'
    const isDown = health.status === 'DOWN'
    // Pausa manual NAO e credencial invalida; sem-credencial (UNCONFIGURED) sim.
    const credentialInvalid =
      isUnconfigured ||
      (!!health.lastError && /credential|credenc|unauthor|invalid|api[\s_-]?key|401|403/i.test(health.lastError))
    // Item 063: quinta classe — falha de job (timeout/5xx/erro de execucao)
    // sem ser problema de credencial/quota/rate-limit.
    const jobFailed =
      !!health.lastError &&
      !credentialInvalid &&
      /job|coleta|timeout|timed?[\s_-]?out|5\d\d|falh|fail/i.test(health.lastError)
    const hasIssue =
      isPaused || isUnconfigured || isDown || isRateLimited || isQuotaExhausted || credentialInvalid || jobFailed || health.status === 'DEGRADED'
    return { isRateLimited, isQuotaExhausted, isPaused, isUnconfigured, isDown, credentialInvalid, jobFailed, hasIssue }
  }, [health, now])

  function announce(next: ActionFeedback) {
    setFeedback(next)
    if (next.tone === 'success') toast.success(next.message)
    else toast.error(`${next.message} · ref ${next.correlationId}`)
  }

  /** Testar credencial (AD7) - nao exige reautenticacao. */
  async function handleTestCredential() {
    const correlationId = crypto.randomUUID()
    setBusyAction('test')
    setFeedback(null)
    try {
      const res = await fetch(`/api/v1/admin/config/credentials/${encodeURIComponent(health.source)}/test`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-correlation-id': correlationId },
        body: JSON.stringify({ correlationId }),
      })
      if (!res.ok) {
        announce({
          tone: 'error',
          correlationId,
          message: await readErrorMessage(res, 'Falha ao testar credencial.'),
        })
        return
      }
      const body = (await res.json()) as { data?: { ok?: boolean; message?: string } }
      const ok = body?.data?.ok !== false
      if (ok) {
        announce({ tone: 'success', correlationId, message: `Credencial de ${health.label} validada com sucesso.` })
        onRecovered?.(correlationId)
      } else {
        announce({
          tone: 'error',
          correlationId,
          message: body?.data?.message ?? `Credencial de ${health.label} invalida ou expirada.`,
        })
      }
    } catch {
      announce({ tone: 'error', correlationId, message: 'Erro de rede ao testar credencial.' })
    } finally {
      setBusyAction(null)
    }
  }

  function openOperation(operation: SensitiveOperation) {
    setActiveOperation(operation)
    setReason('')
    setPassword('')
    setFeedback(null)
  }

  function closeOperation() {
    setActiveOperation(null)
    setReason('')
    setPassword('')
  }

  /** Executa uma operacao sensivel: reautentica (escopo exato) e chama a rota. */
  async function handleSensitiveOperation(event: FormEvent) {
    event.preventDefault()
    if (!activeOperation) return
    const operation = activeOperation
    const correlationId = crypto.randomUUID()
    const scope = `admin.providers:${health.source}:${operation}`
    setBusyAction(operation)
    setFeedback(null)
    try {
      // 1) Reautenticacao escopada -> reauthId
      const reauthRes = await fetch('/api/v1/auth/reauth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: password, scope, correlationId }),
      })
      if (reauthRes.status === 429) {
        announce({ tone: 'error', correlationId, message: 'Muitas tentativas de reautenticacao. Aguarde um minuto.' })
        return
      }
      if (!reauthRes.ok) {
        announce({
          tone: 'error',
          correlationId,
          message: await readErrorMessage(reauthRes, 'Senha atual invalida.'),
        })
        return
      }
      const reauthBody = (await reauthRes.json()) as { data?: { reauthId?: string } }
      const reauthId = reauthBody?.data?.reauthId
      if (!reauthId) {
        announce({ tone: 'error', correlationId, message: 'Reautenticacao nao retornou sessao valida.' })
        return
      }

      // 2) Operacao no provider
      const opRes = await fetch(`/api/v1/admin/providers/${encodeURIComponent(health.source)}/${operation}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-correlation-id': correlationId },
        body: JSON.stringify({ reason: reason.trim(), reauthId, correlationId }),
      })
      if (!opRes.ok) {
        announce({
          tone: 'error',
          correlationId,
          message: await readErrorMessage(opRes, `Falha ao ${OPERATION_LABEL[operation].toLowerCase()}.`),
        })
        return
      }
      const successMessage =
        operation === 'pause'
          ? `${health.label} pausado. Coletas em andamento foram interrompidas.`
          : operation === 'resume'
            ? `${health.label} retomado e ativo novamente.`
            : `Fallback acionado para ${health.label}. Trafego redirecionado para ${health.fallbackProvider ?? 'o provider alternativo'}.`
      announce({ tone: 'success', correlationId, message: successMessage })
      closeOperation()
      onRecovered?.(correlationId)
    } catch {
      announce({ tone: 'error', correlationId, message: 'Erro de rede ao operar o provider.' })
    } finally {
      setBusyAction(null)
    }
  }

  const badge = STATUS_BADGE[health.status]
  const panelTone = getPanelTone(health.status)
  const diagnosticsTone =
    health.status === 'UP' && conditions.hasIssue && !conditions.isUnconfigured
      ? PANEL_TONE.attention
      : panelTone
  const providerUsage = getProviderUsage(health)
  const apiKeyUrl = getApiKeyUrl(health.source)
  const metrics = [
    health.latencyMs !== null ? { label: 'Latência', value: formatNumber(health.latencyMs, ' ms') } : null,
    health.rateLimitResetAt ? { label: 'Rate-limit', value: formatTimestamp(health.rateLimitResetAt) } : null,
    health.fallbackProvider ? { label: 'Fallback', value: health.fallbackProvider } : null,
    health.lastError ? { label: 'Último erro', value: health.lastError } : null,
  ].filter((item): item is { label: string; value: string } => item !== null)
  const reasonValid = reason.trim().length >= 5
  const passwordValid = password.length >= 6
  const submitting = activeOperation !== null && busyAction === activeOperation

  return (
    <section
      data-testid={`inline-recovery-panel-${health.source}`}
      aria-label={`Recuperacao operacional de ${health.label}`}
      className={cn(
        'rounded-lg border p-4 space-y-4',
        panelTone.panel,
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusIcon status={health.status} className={cn('h-5 w-5', panelTone.icon)} />
          <h3 className="text-sm font-semibold">{health.label}</h3>
          <Badge variant="outline" className={badge.className} data-testid={`recovery-status-${health.source}`}>
            {badge.label}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">Atualizado: {formatTimestamp(health.updatedAt)}</span>
      </header>

      {credentialSummary}

      {metrics.length > 0 ? (
        <dl
          data-testid={`recovery-metrics-${health.source}`}
          className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3"
        >
          {metrics.map((metric) => (
            <div key={metric.label}>
              <dt className="text-muted-foreground">{metric.label}</dt>
              <dd className="font-medium break-words" title={metric.value}>
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <details className="group rounded-md border border-border/70 bg-background/50">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-semibold">
          <span>Para que serve este provider</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="space-y-3 border-t border-border/70 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
          <div>
            <p className="font-semibold text-foreground">{providerUsage.title}</p>
            <p className="mt-1">{providerUsage.description}</p>
          </div>
          <div>
            <p className="font-semibold text-foreground">Impacto no aplicativo</p>
            <p className="mt-1">{providerUsage.impact}</p>
          </div>
          <div>
            <p className="font-semibold text-foreground">Fallback e continuidade</p>
            <p className="mt-1">{providerUsage.fallback}</p>
          </div>
        </div>
      </details>

      {/* Sinalizacoes contextuais por classe de falha */}
      {conditions.hasIssue ? (
        <ul className={cn('space-y-1 text-xs', diagnosticsTone.diagnostics)} data-testid={`recovery-diagnostics-${health.source}`}>
          {conditions.isUnconfigured ? (
            <li>Não configurado: adicione a credencial em /admin/credenciais para ativar este provider.</li>
          ) : conditions.credentialInvalid ? (
            <li>Credencial invalida ou inativa: teste a credencial ou atualize em /admin/credenciais.</li>
          ) : null}
          {conditions.isQuotaExhausted ? <li>Quota esgotada: acione um provider de fallback para nao bloquear coletas.</li> : null}
          {conditions.isRateLimited ? <li>Rate-limit ativo ate {formatTimestamp(health.rateLimitResetAt)}.</li> : null}
          {conditions.isDown ? <li>Provider fora do ar: erros consecutivos detectados. Considere pausar e acionar fallback.</li> : null}
          {conditions.isPaused ? <li>Provider pausado: nenhuma coleta sera roteada ate retomar.</li> : null}
          {conditions.jobFailed ? <li>Falha recente de job neste provider: revise os jobs com falha e reprocesse.</li> : null}
        </ul>
      ) : null}

      {/* Acoes de recuperacao */}
      <div className="flex flex-wrap gap-2" data-testid={`recovery-actions-${health.source}`}>
        {credentialActions}

        {conditions.isUnconfigured ? (
          <a
            href={apiKeyUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              'border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/20',
            )}
            aria-label={`Abrir em nova aba a pagina para obter a API key de ${health.label}`}
            data-testid={`recovery-get-api-key-${health.source}`}
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Obter API key
          </a>
        ) : null}

        {!conditions.isUnconfigured ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTestCredential}
            disabled={busyAction !== null}
            data-testid={`recovery-test-credential-${health.source}`}
          >
            {busyAction === 'test' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Testar credencial
          </Button>
        ) : null}

        {/* Item 063: deep-link real — a fila pre-aplica status/kind da URL. */}
        <Link
          href={`/admin/jobs/fila?${conditions.jobFailed ? 'status=FAILED&' : ''}source=${encodeURIComponent(health.source)}`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          data-testid={`recovery-open-jobs-${health.source}`}
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          {conditions.jobFailed ? 'Ver jobs com falha' : 'Abrir jobs filtrados'}
        </Link>

        {conditions.isPaused ? (
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => openOperation('resume')}
            disabled={busyAction !== null}
            data-testid={`recovery-resume-${health.source}`}
          >
            <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Retomar provider
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openOperation('pause')}
            disabled={busyAction !== null}
            className="border-yellow-200 text-yellow-800 hover:bg-yellow-50 dark:border-yellow-900/60 dark:text-yellow-300 dark:hover:bg-yellow-950/20"
            data-testid={`recovery-pause-${health.source}`}
          >
            <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Pausar provider
          </Button>
        )}

        {health.fallbackProvider && !conditions.isPaused ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => openOperation('force-fallback')}
            disabled={busyAction !== null}
            data-testid={`recovery-force-fallback-${health.source}`}
          >
            <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
            Acionar fallback
          </Button>
        ) : null}
      </div>

      {/* Form de operacao sensivel: motivo + reautenticacao */}
      {activeOperation ? (
        <form
          onSubmit={handleSensitiveOperation}
          className="space-y-3 rounded-md border border-border bg-background p-3"
          data-testid={`recovery-operation-form-${health.source}`}
        >
          <p className="text-sm font-medium">{OPERATION_LABEL[activeOperation]} · confirme sua identidade</p>

          <label className="block text-xs font-medium">
            Motivo (minimo 5 caracteres)
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              minLength={5}
              maxLength={500}
              rows={2}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              data-testid={`recovery-reason-${health.source}`}
            />
          </label>

          <label className="block text-xs font-medium">
            Senha atual
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              data-testid={`recovery-password-${health.source}`}
            />
          </label>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={closeOperation} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              variant={activeOperation === 'resume' ? 'default' : 'destructive'}
              disabled={submitting || !reasonValid || !passwordValid}
              data-testid={`recovery-confirm-${health.source}`}
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              Confirmar
            </Button>
          </div>
        </form>
      ) : null}

      {/* Regiao de feedback acessivel (Zero Silencio): toda acao anuncia resultado */}
      <div
        id={liveRegionId}
        role="status"
        aria-live="polite"
        className={cn('min-h-[1rem] text-xs', feedback?.tone === 'error' ? 'text-destructive' : 'text-emerald-600')}
        data-testid={`recovery-feedback-${health.source}`}
      >
        {feedback ? `${feedback.message} (ref: ${feedback.correlationId})` : null}
      </div>
    </section>
  )
}
