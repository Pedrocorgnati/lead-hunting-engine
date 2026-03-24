/**
 * Helpers para construção de NextRequest em testes de integração.
 *
 * Simplifica a criação de requests para routes do App Router sem
 * precisar de um servidor HTTP rodando.
 */
import { NextRequest } from 'next/server'

const BASE_URL = 'http://localhost:3000'

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

interface RequestOptions {
  body?: unknown
  query?: Record<string, string | string[]>
  headers?: Record<string, string>
}

/**
 * Cria um NextRequest para testar routes do App Router diretamente.
 *
 * Uso:
 *   const req = makeRequest('GET', '/api/v1/profile')
 *   const req = makeRequest('POST', '/api/v1/jobs', { body: payload })
 *   const req = makeRequest('GET', '/api/v1/leads', { query: { page: '1' } })
 */
export function makeRequest(
  method: HttpMethod,
  path: string,
  options: RequestOptions = {},
): NextRequest {
  const url = new URL(`${BASE_URL}${path}`)

  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (Array.isArray(value)) {
        value.forEach((v) => url.searchParams.append(key, v))
      } else {
        url.searchParams.set(key, value)
      }
    }
  }

  const init: RequestInit = { method }

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body)
    init.headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    }
  } else if (options.headers) {
    init.headers = options.headers
  }

  return new NextRequest(url.toString(), init)
}

/**
 * Lê e faz parse do JSON de um NextResponse.
 */
export async function parseResponseJson<T = unknown>(
  response: Response,
): Promise<T> {
  return response.json() as Promise<T>
}

/**
 * Extrai params de rota para simular o segundo argumento de handlers dinâmicos.
 *
 * Uso:
 *   const context = makeRouteContext({ id: 'uuid-aqui' })
 *   const res = await GET(req, context)
 */
export function makeRouteContext(
  params: Record<string, string>,
): { params: Promise<Record<string, string>> } {
  return { params: Promise.resolve(params) }
}
