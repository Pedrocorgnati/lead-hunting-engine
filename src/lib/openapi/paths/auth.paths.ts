/**
 * OpenAPI paths — Auth (login, reset-password, update-password).
 * Importado pelo generate-openapi.ts e pelo route /api/docs.
 */

import { z } from 'zod'
import { registry } from '../registry'

// Schemas inline (nao depende de zod-to-openapi extension nos schemas originais)
const SignInBody = z.object({
  email: z.string().email().openapi({ example: 'usuario@empresa.com.br' }),
  password: z.string().min(1).openapi({ example: 'SenhaSegura123' }),
})

const ResetPasswordBody = z.object({
  email: z.string().email().openapi({ example: 'usuario@empresa.com.br' }),
})

const ErrorResponse = z.object({
  error: z.object({
    code: z.string().openapi({ example: 'AUTH_002' }),
    message: z.string().openapi({ example: 'Credenciais invalidas.' }),
  }),
})

// Registrar security scheme
registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
})

// Registrar error envelope global como schema reutilizavel
registry.register('ErrorResponse', ErrorResponse)

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/login',
  tags: ['Auth'],
  summary: 'Autenticar usuario',
  security: [],
  request: {
    body: {
      content: {
        'application/json': { schema: SignInBody },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Login bem-sucedido',
      content: {
        'application/json': {
          schema: z.object({
            user: z.object({
              id: z.string().uuid(),
              email: z.string().email(),
              role: z.string(),
            }),
          }),
        },
      },
    },
    401: {
      description: 'Credenciais invalidas',
      content: { 'application/json': { schema: ErrorResponse } },
    },
    429: {
      description: 'Rate limit ou lockout excedido',
      content: { 'application/json': { schema: ErrorResponse } },
    },
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/reset-password',
  tags: ['Auth'],
  summary: 'Solicitar reset de senha',
  security: [],
  request: {
    body: {
      content: {
        'application/json': { schema: ResetPasswordBody },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Email de reset enviado (sempre, independente de o email existir)',
      content: {
        'application/json': {
          schema: z.object({ sent: z.boolean() }),
        },
      },
    },
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/logout',
  tags: ['Auth'],
  summary: 'Encerrar sessao',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'Sessao encerrada',
      content: {
        'application/json': {
          schema: z.object({ success: z.boolean() }),
        },
      },
    },
  },
})
