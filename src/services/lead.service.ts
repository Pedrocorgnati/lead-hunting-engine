import type { LeadListQuery, UpdateLeadStatusInput, UpdateLeadNotesInput, UpdateLeadPitchInput, RegeneratePitchInput, MarkFalsePositiveInput } from '@/schemas/lead.schema'
import type { Lead } from '@prisma/client'

export class LeadService {
  async findAll(userId: string, query: LeadListQuery): Promise<{ data: Lead[]; total: number }> {
    // TODO: Implementar via /auto-flow execute
    void userId
    void query
    return { data: [], total: 0 }
  }

  async findById(leadId: string, userId: string): Promise<Lead | null> {
    // TODO: Implementar via /auto-flow execute
    void leadId
    void userId
    return null
  }

  async count(userId: string) {
    // TODO: Implementar via /auto-flow execute
    void userId
    return {
      total: 0,
      byStatus: { NEW: 0, CONTACTED: 0, CONVERTED: 0, DISCARDED: 0, FALSE_POSITIVE: 0, ENRICHMENT_PENDING: 0 },
      byTemperature: { COLD: 0, WARM: 0, HOT: 0 },
    }
  }

  async updateStatus(leadId: string, userId: string, data: UpdateLeadStatusInput): Promise<Lead> {
    // TODO: Implementar via /auto-flow execute
    void leadId
    void userId
    void data
    throw new Error('Not implemented - run /auto-flow execute')
  }

  async updateNotes(leadId: string, userId: string, data: UpdateLeadNotesInput): Promise<Lead> {
    // TODO: Implementar via /auto-flow execute
    void leadId
    void userId
    void data
    throw new Error('Not implemented - run /auto-flow execute')
  }

  async updatePitch(leadId: string, userId: string, data: UpdateLeadPitchInput): Promise<Lead> {
    // TODO: Implementar via /auto-flow execute
    void leadId
    void userId
    void data
    throw new Error('Not implemented - run /auto-flow execute')
  }

  async regeneratePitch(leadId: string, userId: string, data: RegeneratePitchInput) {
    // TODO: Implementar via /auto-flow execute
    void leadId
    void userId
    void data
    throw new Error('Not implemented - run /auto-flow execute')
  }

  async markFalsePositive(leadId: string, userId: string, data: MarkFalsePositiveInput): Promise<Lead> {
    // TODO: Implementar via /auto-flow execute
    void leadId
    void userId
    void data
    throw new Error('Not implemented - run /auto-flow execute')
  }

  async exportCsv(userId: string, query: LeadListQuery): Promise<string> {
    // TODO: Implementar via /auto-flow execute
    void userId
    void query
    throw new Error('Not implemented - run /auto-flow execute')
  }
}

export const leadService = new LeadService()
