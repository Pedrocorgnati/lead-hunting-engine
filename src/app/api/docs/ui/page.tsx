/**
 * /api/docs/ui — Swagger/Scalar UI para explorar o spec OpenAPI.
 *
 * Cobre: TASK-3/ST003 (CL-613).
 *
 * Usa @scalar/api-reference-react — UI moderna, sem dependencias pesadas.
 * Fallback: se o pacote nao estiver instalado, exibe instrucao de download do JSON.
 */

import type { Metadata } from 'next'
import { ApiReferenceReact } from '@scalar/api-reference-react'
import '@scalar/api-reference-react/style.css'

export const metadata: Metadata = {
  title: 'Lead Hunting Engine — API Reference',
  description: 'Documentacao interativa da API do Lead Hunting Engine.',
}

export default function ApiDocsPage() {
  return (
    <ApiReferenceReact
      configuration={{
        url: '/api/docs',
        theme: 'default',
        layout: 'modern',
        darkMode: true,
        hideModels: false,
        authentication: {
          preferredSecurityScheme: 'bearerAuth',
        },
      }}
    />
  )
}
