/**
 * Gera o documento OpenAPI 3.1 a partir do registry central.
 *
 * Cobre: TASK-3/ST001 (CL-460, CL-613).
 */

import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi'
import { registry } from './registry'

export function generateOpenApiDocument(): ReturnType<OpenApiGeneratorV31['generateDocument']> {
  // Importar side-effects dos path registradores (lazy — sem circular deps)
  // Os path registradores sao importados pelo generate-openapi.ts (build-time)
  // e pelo route.ts (runtime). Aqui apenas geramos o doc a partir do registry.
  const generator = new OpenApiGeneratorV31(registry.definitions)

  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Lead Hunting Engine API',
      version: '1.0.0',
      description:
        'API publica do Lead Hunting Engine. Endpoints de integracao para parceiros e ferramentas externas (ex: BudgetFlow).',
    },
    servers: [
      {
        url: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
        description: 'Servidor atual',
      },
    ],
    security: [{ bearerAuth: [] }],
  })
}
