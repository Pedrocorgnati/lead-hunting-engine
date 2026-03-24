export interface WithClassName {
  className?: string
}

export interface WithChildren {
  children: React.ReactNode
}

export interface LoadingState {
  isLoading: boolean
  error?: string | null
}

export interface PaginationState {
  page: number
  limit: number
  total: number
}

export interface FilterState {
  search?: string
  [key: string]: string | number | boolean | undefined
}
