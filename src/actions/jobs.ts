import { JobStatus } from '@/lib/constants/enums'

export interface CollectionJobSummary {
  id: string
  name: string
  query: string
  location: string
  status: JobStatus
  progress: number
  resultCount: number
  maxResults: number
  radiusMeters: number
  createdAt: string
  errorMessage?: string
}

// TODO: Implementar backend — run /auto-flow execute
export async function getJobs(): Promise<CollectionJobSummary[]> {
  return []
}

// TODO: Implementar backend — run /auto-flow execute
export async function createJob(_data: {
  name: string
  query: string
  location: string
  radiusMeters: number
  maxResults: number
}): Promise<{ id: string }> {
  throw new Error('Not implemented - run /auto-flow execute')
}

// TODO: Implementar backend — run /auto-flow execute
export async function getJobStatus(_id: string): Promise<{
  status: JobStatus
  progress: number
  resultCount: number
  errorMessage?: string
} | null> {
  return null
}

// TODO: Implementar backend — run /auto-flow execute
export async function cancelJob(_id: string): Promise<{ success: boolean }> {
  throw new Error('Not implemented - run /auto-flow execute')
}
