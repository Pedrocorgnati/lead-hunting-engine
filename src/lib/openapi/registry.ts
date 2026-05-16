/**
 * OpenAPI Registry — singleton compartilhado em toda a aplicacao.
 *
 * Cobre: TASK-3/ST001 (CL-460, CL-613).
 *
 * Uso:
 *   import { registry } from '@/lib/openapi/registry'
 *   registry.registerPath({ method: 'get', path: '/leads', ... })
 */

import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

extendZodWithOpenApi(z)

export const registry = new OpenAPIRegistry()
