jest.mock('@/lib/prisma', () => ({ prisma: {}, getPrisma: () => ({}) }))

import { resolveStatus } from '../health-status'

describe('resolveStatus (H-07: UNCONFIGURED vs PAUSED)', () => {
  it('inativo SEM credencial -> UNCONFIGURED', () => {
    expect(resolveStatus(false, [], null, false)).toBe('UNCONFIGURED')
  })

  it('inativo COM credencial -> PAUSED (pausa explicita)', () => {
    expect(resolveStatus(false, [], null, true)).toBe('PAUSED')
  })

  it('default hasCredential=true preserva compat (PAUSED quando inativo)', () => {
    expect(resolveStatus(false, [], null)).toBe('PAUSED')
  })

  it('ativo + 3 erros consecutivos -> DOWN', () => {
    expect(resolveStatus(true, [true, true, true], null)).toBe('DOWN')
  })

  it('ativo + latencia alta -> DEGRADED', () => {
    expect(resolveStatus(true, [false], 5000)).toBe('DEGRADED')
  })

  it('ativo e limpo -> UP', () => {
    expect(resolveStatus(true, [false, false], 100)).toBe('UP')
  })
})
