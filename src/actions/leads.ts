'use server'

import { LeadType, LeadStatus } from '@/lib/constants/enums'

export interface LeadSummary {
  id: string
  name: string
  city: string
  type: LeadType
  score: number
  status: LeadStatus
}

export interface DashboardStats {
  totalLeads: string
  highOpportunity: string
  conversionRate: string
  activeJobs: string
}

// TODO: Implementar backend — run /auto-flow execute
export async function getDashboardStats(): Promise<DashboardStats> {
  return {
    totalLeads: '0',
    highOpportunity: '0',
    conversionRate: '0%',
    activeJobs: '0',
  }
}

// TODO: Implementar backend — run /auto-flow execute
export async function getRecentLeads(): Promise<LeadSummary[]> {
  return []
}

// TODO: Implementar backend — run /auto-flow execute
export async function getLeads(_params?: {
  page?: number
  search?: string
  type?: string
  status?: string
}): Promise<{ data: LeadSummary[]; total: number; pages: number }> {
  return { data: [], total: 0, pages: 0 }
}

// TODO: Implementar backend — run /auto-flow execute
export async function getLead(_id: string): Promise<LeadSummary | null> {
  return null
}

// TODO: Implementar backend — run /auto-flow execute
export async function updateLeadStatus(_id: string, _status: LeadStatus): Promise<{ success: boolean }> {
  throw new Error('Not implemented - run /auto-flow execute')
}

// TODO: Implementar backend — run /auto-flow execute
export async function updateLeadNotes(_id: string, _notes: string): Promise<{ success: boolean }> {
  throw new Error('Not implemented - run /auto-flow execute')
}

// TODO: Implementar backend — run /auto-flow execute
export async function exportLeads(_params?: unknown): Promise<{ url: string }> {
  throw new Error('Not implemented - run /auto-flow execute')
}
