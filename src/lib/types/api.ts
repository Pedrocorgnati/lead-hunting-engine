export interface ApiResponse<T> {
  data: T
  error: null
}

export interface ApiError {
  data: null
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export type ApiResult<T> = ApiResponse<T> | ApiError

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  limit: number
  hasNext: boolean
  hasPrev: boolean
}

export interface ErrorResponse {
  code: string
  message: string
  details?: Record<string, string[]>
}
