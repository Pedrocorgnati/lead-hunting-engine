import type { ConsentCategory } from '@/lib/consent/store'

/**
 * TASK-3/A2 (P0): metadados canonicos das categorias de consentimento LGPD.
 * Fonte unica de label/descricao para a tela publica /consentimento, o
 * CookieBanner (G8) e o ConsentReceiptWidget (reutilizado por A26 / AD26).
 * Evita maps locais espalhados por componente (regra anti-hardcode).
 */
export interface ConsentCategoryMeta {
  id: ConsentCategory
  label: string
  description: string
  /** Categoria obrigatoria: nao pode ser desmarcada pelo titular. */
  locked: boolean
}

export const CONSENT_CATEGORY_META: readonly ConsentCategoryMeta[] = [
  {
    id: 'necessary',
    label: 'Essenciais',
    description: 'Login, seguranca e sessao. Obrigatorios para o site funcionar.',
    locked: true,
  },
  {
    id: 'analytics',
    label: 'Analytics',
    description: 'Metricas agregadas (GA4/Plausible) para melhorar a plataforma.',
    locked: false,
  },
  {
    id: 'marketing',
    label: 'Marketing',
    description: 'Retargeting e campanhas personalizadas.',
    locked: false,
  },
] as const

/** Lookup label por id de categoria (fallback para o proprio id). */
export function consentCategoryLabel(id: string): string {
  return CONSENT_CATEGORY_META.find((c) => c.id === id)?.label ?? id
}
