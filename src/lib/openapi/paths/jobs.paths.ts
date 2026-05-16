/**
 * OpenAPI paths — Jobs (scraper jobs CRUD + status).
 */

import { z } from 'zod'
import { registry } from '../registry'

const JobObject = z.object({
  id: z.string().uuid(),
  name: z.string().openapi({ example: 'Clinicas SP - Zona Norte' }),
  niche: z.string().openapi({ example: 'clinica_medica' }),
  city: z.string().openapi({ example: 'Sao Paulo' }),
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']),
  leadsFound: z.number().int().min(0),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
})

const CreateJobBody = z.object({
  name: z.string().min(3).max(100).openapi({ example: 'Clinicas SP - Zona Norte' }),
  niche: z.string().openapi({ example: 'clinica_medica' }),
  city: z.string().openapi({ example: 'Sao Paulo' }),
  maxLeads: z.number().int().min(10).max(500).default(100).optional(),
})

const ErrorResponse = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/jobs',
  tags: ['Jobs'],
  summary: 'Criar job de scraping',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: { 'application/json': { schema: CreateJobBody } },
      required: true,
    },
  },
  responses: {
    201: {
      description: 'Job criado e enfileirado',
      content: { 'application/json': { schema: z.object({ data: JobObject }) } },
    },
    429: {
      description: 'Rate limit excedido (max 5/min)',
      content: { 'application/json': { schema: ErrorResponse } },
    },
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/jobs',
  tags: ['Jobs'],
  summary: 'Listar jobs do usuario',
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      page: z.coerce.number().int().min(1).default(1).optional(),
      limit: z.coerce.number().int().min(1).max(50).default(10).optional(),
      status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']).optional(),
    }),
  },
  responses: {
    200: {
      description: 'Lista de jobs paginada',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(JobObject),
            meta: z.object({ total: z.number().int(), page: z.number().int(), limit: z.number().int() }),
          }),
        },
      },
    },
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/jobs/{id}',
  tags: ['Jobs'],
  summary: 'Buscar job por ID',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Job encontrado',
      content: { 'application/json': { schema: z.object({ data: JobObject }) } },
    },
    404: {
      description: 'Job nao encontrado',
      content: { 'application/json': { schema: ErrorResponse } },
    },
  },
})
