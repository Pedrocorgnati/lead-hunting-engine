import type { ApiResult } from '@/lib/types/api'

interface FetchOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>
}

async function request<T>(url: string, options: FetchOptions = {}): Promise<ApiResult<T>> {
  const { params, ...fetchOptions } = options

  let fullUrl = url
  if (params) {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) searchParams.set(k, String(v))
    })
    const qs = searchParams.toString()
    if (qs) fullUrl += `?${qs}`
  }

  const response = await fetch(fullUrl, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    },
  })

  const json = await response.json()

  if (!response.ok) {
    return {
      data: null,
      error: json.error ?? { code: 'UNKNOWN', message: 'Erro desconhecido' },
    }
  }

  return { data: json as T, error: null }
}

export const apiClient = {
  get: <T>(url: string, params?: FetchOptions['params']) =>
    request<T>(url, { method: 'GET', params }),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(url: string) =>
    request<T>(url, { method: 'DELETE' }),
}
