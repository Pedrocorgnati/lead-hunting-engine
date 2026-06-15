/**
 * outreach-engine (06-10, task 21/F-21): prioridade dinamica por SLA.
 */
import { computePriority } from '../sla-priority'

const NOW = new Date('2026-06-10T12:00:00Z')

describe('computePriority', () => {
  it('resposta parcial empurra para o topo da fila', () => {
    const base = computePriority({ baseScore: 50, scheduledAt: NOW, hasPartialReply: false, slaHours: 24, now: NOW })
    const partial = computePriority({ baseScore: 50, scheduledAt: NOW, hasPartialReply: true, slaHours: 24, now: NOW })
    expect(partial).toBeGreaterThan(base)
  })

  it('SLA estourado adiciona urgencia maxima', () => {
    const old = new Date(NOW.getTime() - 30 * 3600_000) // 30h, SLA 24h
    const p = computePriority({ baseScore: 50, scheduledAt: old, hasPartialReply: false, slaHours: 24, now: NOW })
    expect(p).toBe(90) // 50 + 40
  })

  it('proximo do SLA (>=75%) adiciona urgencia parcial', () => {
    const recent = new Date(NOW.getTime() - 20 * 3600_000) // 20/24 = 83%
    const p = computePriority({ baseScore: 50, scheduledAt: recent, hasPartialReply: false, slaHours: 24, now: NOW })
    expect(p).toBe(70) // 50 + 20
  })

  it('lead quente recente sem SLA pressure mantem base', () => {
    const p = computePriority({ baseScore: 80, scheduledAt: NOW, hasPartialReply: false, slaHours: 24, now: NOW })
    expect(p).toBe(80)
  })
})
