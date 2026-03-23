import type { CreateJobInput } from '@/schemas/job.schema'
import type { CollectionJob } from '@prisma/client'

export class JobService {
  async findAllByUser(userId: string): Promise<CollectionJob[]> {
    // TODO: Implementar via /auto-flow execute
    void userId
    return []
  }

  async create(data: CreateJobInput, userId: string): Promise<CollectionJob> {
    // TODO: Implementar via /auto-flow execute
    void data
    void userId
    throw new Error('Not implemented - run /auto-flow execute')
  }

  async getStatus(jobId: string, userId: string) {
    // TODO: Implementar via /auto-flow execute
    void jobId
    void userId
    return null
  }

  async cancel(jobId: string, userId: string): Promise<void> {
    // TODO: Implementar via /auto-flow execute
    void jobId
    void userId
    throw new Error('Not implemented - run /auto-flow execute')
  }

  async countConcurrent(userId: string): Promise<number> {
    // TODO: Implementar via /auto-flow execute
    void userId
    return 0
  }
}

export const jobService = new JobService()
