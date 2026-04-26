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

  const init: { method: string; body?: string; headers?: Record<string, string> } = { method }

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body)
    init.headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    }
  } else if (options.headers) {
    init.headers = options.headers
  }

  // NextRequest usa um RequestInit proprio mais restritivo (signal: AbortSignal | undefined,
  // nao aceita null). O init dos testes e simples (method/body/headers) e nao usa signal,
  // entao omitimos a tipagem explicita para evitar conflito entre os dois RequestInits do DOM/Next.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new NextRequest(url.toString(), init as any)
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
 * Next.js 16 trata `params` como uma Promise. O retorno é tipado de forma
 * flexível (`any`) para casar com qualquer assinatura de handler sem exigir
 * generics nos call sites — os testes de integração validam o comportamento
 * real da rota, não o refinamento estático do tipo.
 *
 * Uso:
 *   const context = makeRouteContext({ id: 'uuid-aqui' })
 *   const res = await GET(req, context)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeRouteContext(params: Record<string, string>): any {
  return { params: Promise.resolve(params) }
}
