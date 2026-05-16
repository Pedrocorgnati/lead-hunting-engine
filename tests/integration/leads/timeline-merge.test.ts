import { mergeTimeline, type LeadHistory, type ContactEvent } from '@/lib/leads/merge-timeline'

const historyFixture: LeadHistory[] = [
  { id: '1', field: 'status', changedBy: 'user-a', occurredAt: '2024-01-10T10:00:00Z' },
  { id: '2', field: 'email', changedBy: 'user-b', occurredAt: '2024-01-08T10:00:00Z' },
]

const contactFixture: ContactEvent[] = [
  { id: '1', type: 'call', channel: 'phone', contactedBy: 'user-a', occurredAt: '2024-01-09T10:00:00Z' },
]

describe('mergeTimeline', () => {
  it('merges and sorts desc by occurredAt', () => {
    const out = mergeTimeline(historyFixture, contactFixture)
    expect(out).toHaveLength(3)
    expect(new Date(out[0].occurredAt) >= new Date(out[1].occurredAt)).toBe(true)
    expect(new Date(out[1].occurredAt) >= new Date(out[2].occurredAt)).toBe(true)
  })

  it('assigns correct kinds', () => {
    const out = mergeTimeline(historyFixture, contactFixture)
    expect(out.find((e) => e.kind === 'contact')).toBeDefined()
    expect(out.filter((e) => e.kind === 'history')).toHaveLength(2)
  })

  it('returns empty array when both inputs empty', () => {
    expect(mergeTimeline([], [])).toEqual([])
  })
})
