/**
 * OpenAPI paths — Exports (criar + download).
 */

import { z } from 'zod'
import { registry } from '../registry'

const ExportObject = z.object({
  id: z.string().uuid(),
  format: z.enum(['csv', 'xlsx', 'json']),
  status: z.enum(['PENDING', 'PROCESSING', 'READY', 'FAILED']),
  downloadUrl: z.string().url().nullable(),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/export',
  tags: ['Exports'],
  summary: 'Criar export de leads',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            format: z.enum(['csv', 'xlsx', 'json']).default('csv'),
            filters: z.object({
              status: z.string().optional(),
              city: z.string().optional(),
              niche: z.string().optional(),
              scoreMin: z.number().int().optional(),
              jobId: z.string().uuid().optional(),
            }).optional(),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    202: {
      description: 'Export enfileirado',
      content: { 'application/json': { schema: z.object({ data: ExportObject }) } },
    },
    429: {
      description: 'Rate limit excedido (max 5/min)',
      content: {
        'application/json': {
          schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }),
        },
      },
    },
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/export/{id}',
  tags: ['Exports'],
  summary: 'Verificar status do export',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Status atual do export',
      content: { 'application/json': { schema: z.object({ data: ExportObject }) } },
    },
    404: {
      description: 'Export nao encontrado',
      content: {
        'application/json': {
          schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }),
        },
      },
    },
  },
})
