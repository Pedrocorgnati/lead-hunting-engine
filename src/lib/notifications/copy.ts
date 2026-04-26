/**
 * Notifications Copy Map — pt-BR
 * ================================
 *
 * Mapa centralizado `event -> { title, body, cta? }` em portugues.
 * Origem: INTAKE-REVIEW TASK-9 (CL-135).
 *
 * Eventos cobertos:
 *   - JOB_COMPLETED        — coleta finalizada com sucesso
 *   - JOB_FAILED           — coleta com falha
 *   - LEAD_CREATED         — novo lead qualificado
 *   - LEAD_HOT             — lead quente (score > 80) — TASK-11
 *   - CREDENTIAL_EXPIRING  — credencial de API prestes a expirar
 *   - RETENTION_CLEANUP    — limpeza retroativa de raw_lead_data
 *   - LIMIT_REACHED        — limite de plano atingido (jobs concorrentes ou leads/mes)
 *
 * Eventos legados (dispatcher v1 — TASK-11):
 *   - LEAD_CONVERTED       — mantido por compatibilidade
 *   - JOB_FINISHED         — alias legado de JOB_COMPLETED
 */

export type NotificationEventKey =
  | 'JOB_COMPLETED'
  | 'JOB_FAILED'
  | 'LEAD_CREATED'
  | 'LEAD_HOT'
  | 'CREDENTIAL_EXPIRING'
  | 'RETENTION_CLEANUP'
  | 'LIMIT_REACHED'
  | 'SESSIONS_REVOKED_BY_ADMIN'
  | 'PASSWORD_RESET_FORCED'
  // R-10 intake-review (CL-304): export async pronto para download.
  | 'EXPORT_READY'
  // R-02 intake-review (CL-311): contato inbound via landing.
  | 'CONTACT_MESSAGE_RECEIVED'
  // Legados (compat dispatcher v1):
  | 'LEAD_CONVERTED'
  | 'JOB_FINISHED'

export interface NotificationCopy {
  title: string
  body: string
  cta?: { label: string; href: string }
}

export type CopyParams = Record<string, unknown>

type CopyBuilder = (params: CopyParams) => NotificationCopy

const builders: Record<NotificationEventKey, CopyBuilder> = {
  JOB_COMPLETED: (p) => {
    const count = Number(p.count ?? 0)
    const jobName = String(p.jobName ?? 'Coleta')
    const jobId = p.jobId ? String(p.jobId) : undefined
    return {
      title: 'Coleta concluida',
      body: `${jobName} finalizou com ${count} lead${count === 1 ? '' : 's'} qualificado${count === 1 ? '' : 's'}.`,
      cta: jobId ? { label: 'Ver coleta', href: `/coletas/${jobId}` } : { label: 'Ver coletas', href: '/coletas' },
    }
  },

  JOB_FAILED: (p) => {
    const jobName = String(p.jobName ?? 'Coleta')
    const reason = p.reason ? String(p.reason) : 'erro desconhecido'
    const jobId = p.jobId ? String(p.jobId) : undefined
    return {
      title: 'Coleta falhou',
      body: `${jobName} nao pode ser concluida: ${reason}.`,
      cta: jobId ? { label: 'Ver detalhes', href: `/coletas/${jobId}` } : { label: 'Ver coletas', href: '/coletas' },
    }
  },

  LEAD_CREATED: (p) => {
    const businessName = String(p.businessName ?? 'Novo lead')
    const city = p.city ? String(p.city) : null
    const leadId = p.leadId ? String(p.leadId) : undefined
    return {
      title: 'Novo lead qualificado',
      body: city ? `${businessName} (${city}) entrou na sua base.` : `${businessName} entrou na sua base.`,
      cta: leadId ? { label: 'Abrir lead', href: `/leads/${leadId}` } : { label: 'Ver leads', href: '/leads' },
    }
  },

  LEAD_HOT: (p) => {
    const businessName = String(p.businessName ?? 'Lead')
    const score = Number(p.score ?? 0)
    const city = p.city ? String(p.city) : null
    const leadId = p.leadId ? String(p.leadId) : undefined
    return {
      title: 'Novo lead quente descoberto',
      body: `${businessName}${city ? ` (${city})` : ''} — score ${score}/100.`,
      cta: leadId ? { label: 'Abrir lead', href: `/leads/${leadId}` } : { label: 'Ver leads', href: '/leads' },
    }
  },

  CREDENTIAL_EXPIRING: (p) => {
    const provider = String(p.provider ?? 'Provedor')
    const days = Number(p.daysRemaining ?? 0)
    return {
      title: 'Credencial prestes a expirar',
      body: days > 0
        ? `A credencial de ${provider} expira em ${days} dia${days === 1 ? '' : 's'}. Renove antes do vencimento.`
        : `A credencial de ${provider} expirou ou expira hoje. Renove imediatamente.`,
      cta: { label: 'Atualizar credencial', href: '/admin/configuracoes' },
    }
  },

  RETENTION_CLEANUP: (p) => {
    const removed = Number(p.removed ?? 0)
    const days = Number(p.retentionDays ?? 0)
    return {
      title: 'Limpeza de retencao executada',
      body: `${removed} registro${removed === 1 ? '' : 's'} de dados brutos acima de ${days} dia${days === 1 ? '' : 's'} foram removidos conforme sua politica.`,
      cta: { label: 'Configurar retencao', href: '/perfil' },
    }
  },

  LIMIT_REACHED: (p) => {
    const kind = String(p.kind ?? 'plan')
    const limit = Number(p.limit ?? 0)
    const current = Number(p.current ?? limit)
    if (kind === 'concurrent_jobs') {
      return {
        title: 'Limite de coletas simultaneas atingido',
        body: `Voce ja esta com ${current}/${limit} coleta${limit === 1 ? '' : 's'} rodando. Aguarde uma finalizar antes de iniciar outra.`,
        cta: { label: 'Ver coletas', href: '/coletas' },
      }
    }
    if (kind === 'leads_per_month') {
      return {
        title: 'Limite mensal de leads atingido',
        body: `Voce atingiu ${current}/${limit} leads neste mes. Novos leads serao bloqueados ate a virada do ciclo.`,
        cta: { label: 'Ver perfil', href: '/perfil' },
      }
    }
    return {
      title: 'Limite do plano atingido',
      body: `Voce atingiu ${current}/${limit} do limite configurado.`,
      cta: { label: 'Ver perfil', href: '/perfil' },
    }
  },

  SESSIONS_REVOKED_BY_ADMIN: (p) => {
    const reason = p.reason ? String(p.reason) : null
    return {
      title: 'Suas sessoes foram encerradas',
      body: reason
        ? `Um administrador encerrou suas sessoes ativas. Motivo: ${reason}. Faca login novamente.`
        : 'Um administrador encerrou suas sessoes ativas por motivos de seguranca. Faca login novamente.',
      cta: { label: 'Fazer login', href: '/login?reason=sessions_revoked' },
    }
  },

  PASSWORD_RESET_FORCED: (p) => {
    const reason = p.reason ? String(p.reason) : null
    return {
      title: 'Troca de senha obrigatoria',
      body: reason
        ? `Um administrador solicitou a troca da sua senha. Motivo: ${reason}. Acesse o app para definir uma nova senha.`
        : 'Um administrador solicitou a troca da sua senha. Acesse o app para definir uma nova senha.',
      cta: { label: 'Trocar senha', href: '/auth/reset-password/update' },
    }
  },

  EXPORT_READY: (p) => {
    const format = String(p.format ?? 'CSV').toUpperCase()
    const rows = p.rowCount != null ? Number(p.rowCount) : null
    const exportId = p.exportId ? String(p.exportId) : undefined
    return {
      title: 'Exportacao pronta',
      body: rows != null
        ? `Sua exportacao ${format} com ${rows.toLocaleString('pt-BR')} linha${rows === 1 ? '' : 's'} esta disponivel.`
        : `Sua exportacao ${format} esta disponivel para download.`,
      cta: exportId
        ? { label: 'Baixar', href: `/exports#${exportId}` }
        : { label: 'Ver exportacoes', href: '/exports' },
    }
  },

  CONTACT_MESSAGE_RECEIVED: (p) => {
    const name = p.name ? String(p.name) : 'novo contato'
    const subject = p.subject ? String(p.subject) : null
    return {
      title: 'Nova mensagem de contato',
      body: subject
        ? `${name}: "${subject.slice(0, 80)}${subject.length > 80 ? '...' : ''}"`
        : `${name} enviou uma mensagem pela landing.`,
      cta: { label: 'Abrir inbox', href: '/admin/contact-messages' },
    }
  },

  // Legados — mantem para compat com TASK-11.
  LEAD_CONVERTED: (p) => {
    const businessName = String(p.businessName ?? 'Lead')
    const leadId = p.leadId ? String(p.leadId) : undefined
    return {
      title: 'Lead convertido',
      body: `${businessName} foi marcado como convertido.`,
      cta: leadId ? { label: 'Abrir lead', href: `/leads/${leadId}` } : undefined,
    }
  },

  JOB_FINISHED: (p) => builders.JOB_COMPLETED(p),
}

/**
 * Retorna copy pt-BR para um evento.
 * Parametros desconhecidos sao ignorados; chaves faltantes usam defaults.
 */
export function copyFor(event: NotificationEventKey, params: CopyParams = {}): NotificationCopy {
  const builder = builders[event]
  if (!builder) {
    return {
      title: 'Notificacao',
      body: 'Voce tem uma nova atualizacao.',
    }
  }
  return builder(params)
}

export const NOTIFICATION_EVENTS: NotificationEventKey[] = [
  'JOB_COMPLETED',
  'JOB_FAILED',
  'LEAD_CREATED',
  'LEAD_HOT',
  'CREDENTIAL_EXPIRING',
  'RETENTION_CLEANUP',
  'LIMIT_REACHED',
  'SESSIONS_REVOKED_BY_ADMIN',
  'EXPORT_READY',
  'CONTACT_MESSAGE_RECEIVED',
]

/**
 * Labels human-friendly para UI de preferencias.
 */
export const EVENT_LABELS: Record<NotificationEventKey, string> = {
  JOB_COMPLETED: 'Coleta concluida',
  JOB_FAILED: 'Coleta falhou',
  LEAD_CREATED: 'Novo lead qualificado',
  LEAD_HOT: 'Lead quente (score alto)',
  CREDENTIAL_EXPIRING: 'Credencial expirando',
  RETENTION_CLEANUP: 'Limpeza de retencao',
  LIMIT_REACHED: 'Limite de plano atingido',
  SESSIONS_REVOKED_BY_ADMIN: 'Sessoes encerradas por admin',
  PASSWORD_RESET_FORCED: 'Troca de senha forcada pelo admin',
  EXPORT_READY: 'Exportacao pronta para download',
  CONTACT_MESSAGE_RECEIVED: 'Nova mensagem de contato inbound',
  LEAD_CONVERTED: 'Lead convertido',
  JOB_FINISHED: 'Coleta concluida (legado)',
}
