'use client'

// Wrapper legado mantido por compatibilidade de import. NAO configura um Toaster
// proprio: delega para o contrato unico em components/ToastCenter para evitar
// configuracoes de toast divergentes (Zero Silencio, fonte unica de verdade).
import { ToastCenter } from '@/components/ToastCenter'

export function Toaster() {
  return <ToastCenter />
}

export { toast } from '@/components/ToastCenter'
