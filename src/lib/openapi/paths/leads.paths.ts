/**
 * OpenAPI paths — Leads (CRUD + filtros).
 */

import { z } from 'zod'
import { registry } from '../registry'

const LeadObject = z.object({
  id: z.string().uuid(),
  businessName: z.string().openapi({ example: 'Clinica Saude Total' }),
  city: z.string().openapi({ example: 'Sao Paulo' }),
  niche: z.string().openapi({ example: 'clinica_medica' }),
  status: z.enum(['NEW', 'CONTACTED', 'NEGOTIATING', 'CONVERTED', 'DISCARDED']),
  score: z.number().int().min(0).max(100),
  temperature: z.enum(['hot', 'warm', 'cold']),
  createdAt: z.string().datetime(),
})

const ErrorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/leads',
  tags: ['Leads'],
  summary: 'Listar leads com filtros e paginacao',
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      page: z.coerce.number().int().min(1).default(1).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
      sortBy: z.enum(['score', 'createdAt', 'businessName', 'temperature']).optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
      city: z.string().optional(),
      niche: z.string().optional(),
      status: z.string().optional(),
      scoreMin: z.coerce.number().optional(),
      scoreMax: z.coerce.number().optional(),
      search: z.string().optional(),
      recency: z.enum(['24h', '7d', '30d']).optional(),
    }),
  },
  responses: {
    200: {
      description: 'Lista de leads paginada',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(LeadObject),
            meta: z.object({
              total: z.number().int(),
              page: z.number().int(),
              limit: z.number().int(),
              totalPages: z.number().int(),
            }),
          }),
        },
      },
    },
    401: {
      description: 'Nao autenticado',
      content: { 'application/json': { schema: ErrorResponse } },
    },
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/leads/{id}',
  tags: ['Leads'],
  summary: 'Buscar lead por ID',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Lead encontrado',
      content: { 'application/json': { schema: z.object({ data: LeadObject }) } },
    },
    404: {
      description: 'Lead nao encontrado',
      content: { 'application/json': { schema: ErrorResponse } },
    },
  },
})

registry.registerPath({
  method: 'patch',
  path: '/api/v1/leads/{id}/status',
  tags: ['Leads'],
  summary: 'Atualizar status do lead',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            status: z.enum(['NEW', 'CONTACTED', 'NEGOTIATING', 'CONVERTED', 'DISCARDED', 'DISQUALIFIED']),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Status atualizado',
      content: { 'application/json': { schema: z.object({ data: LeadObject }) } },
    },
  },
})
