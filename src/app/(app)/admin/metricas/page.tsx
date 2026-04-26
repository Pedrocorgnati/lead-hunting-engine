'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/use-auth'
import { Routes } from '@/lib/constants'
import type { MetricsData } from '@/actions/config'
import { getMetrics } from '@/actions/config'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Users, Database, Activity, Mail, Key, RefreshCw } from 'lucide-react'
import { useToast } from '@/lib/hooks/use-toast'
import { ApiUsageBreakdown } from '@/components/admin/ApiUsageBreakdown'
import { RadarUsageChart } from '@/components/admin/RadarUsageChart'
import { ProductMetricsCards } from '@/components/admin/product-metrics-cards'
import { MetricsComparePanel } from '@/components/admin/MetricsComparePanel'
import { CollectionsTimelineChart } from '@/components/admin/CollectionsTimelineChart'
import { AlertsSettings } from '@/components/admin/AlertsSettings'
import { FalsePositiveGlobalCard } from '@/components/admin/FalsePositiveGlobalCard'

interface MetricCardProps {
  icon: React.ReactNode
  label: string
  value: number
  subText?: string
  testId: string
}

function MetricCard({ icon, label, value, subText, testId }: MetricCardProps) {
  return (
    <Card data-testid={testId}>
      <CardContent className="flex items-start gap-4 pt-2">
        <div className="rounded-lg bg-primary/10 p-3 text-primary" aria-hidden="true">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p
            className="text-2xl font-bold tabular-nums text-foreground"
            aria-label={`${label}: ${value.toLocaleString('pt-BR')}`}
          >
            {value.toLocaleString('pt-BR')}
          </p>
          {subText && (
            <p className="text-xs text-muted-foreground mt-0.5">{subText}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function MetricsSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-busy="true"
      aria-label="Carregando métricas"
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-xl" />
      ))}
    </div>
  )
}

export default function MetricasPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const router = useRouter()
  const [metrics, setMetrics] = useState<MetricsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace(Routes.DASHBOARD)
  }, [isAdmin, authLoading, router])

  if (authLoading || !isAdmin) return null

  async function fetchMetrics() {
    setIsLoading(true)
    setError(null)
    try {
      const data = await getMetrics()
      setMetrics(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar métricas.'
      setError(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchMetrics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div data-testid="admin-metrics-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Métricas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visão geral da plataforma em tempo real
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchMetrics}
          disabled={isLoading}
          data-testid="metrics-refresh-btn"
        >
          <RefreshCw className={isLoading ? 'animate-spin' : ''} />
          <span className="sr-only">Atualizar métricas</span>
        </Button>
      </div>

      <ProductMetricsCards />

      {/* TASK-25/ST004 (CL-109): falso-positivo global */}
      <FalsePositiveGlobalCard />

      {isLoading && !metrics && <MetricsSkeleton />}

      {error && !metrics && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center space-y-3"
          data-testid="metrics-error"
        >
          <p className="text-sm text-destructive font-medium">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchMetrics}>
            Tentar novamente
          </Button>
        </div>
      )}

      {metrics && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            icon={<Users className="h-5 w-5" />}
            label="Usuários"
            value={metrics.users.total}
            testId="metric-card-usuarios"
          />
          <MetricCard
            icon={<Database className="h-5 w-5" />}
            label="Leads coletados"
            value={metrics.leads.total}
            testId="metric-card-leads-coletados"
          />
          <MetricCard
            icon={<Activity className="h-5 w-5" />}
            label="Coletas realizadas"
            value={metrics.jobs.total}
            subText={`${metrics.jobs.active.toLocaleString('pt-BR')} em andamento`}
            testId="metric-card-coletas-realizadas"
          />
          <MetricCard
            icon={<Mail className="h-5 w-5" />}
            label="Convites pendentes"
            value={metrics.invites.pending}
            testId="metric-card-convites-pendentes"
          />
          <MetricCard
            icon={<Key className="h-5 w-5" />}
            label="Credenciais ativas"
            value={metrics.credentials.active}
            testId="metric-card-credenciais-ativas"
          />
        </div>
      )}

      <MetricsComparePanel />
      <CollectionsTimelineChart />
      <ApiUsageBreakdown />
      <RadarUsageChart />
      <AlertsSettings />
    </div>
  )
}
