import { CircuitBreaker, CircuitOpenError } from '../circuit-breaker'

describe('CircuitBreaker', () => {
  beforeEach(() => CircuitBreaker.reset())

  it('permanece CLOSED antes do threshold', () => {
    CircuitBreaker.recordFailure('test:1')
    CircuitBreaker.recordFailure('test:1')
    expect(CircuitBreaker.inspect('test:1').state).toBe('CLOSED')
    expect(() => CircuitBreaker.ensureClosed('test:1')).not.toThrow()
  })

  it('abre apos 3 falhas e rejeita ensureClosed', () => {
    CircuitBreaker.recordFailure('test:2')
    CircuitBreaker.recordFailure('test:2')
    CircuitBreaker.recordFailure('test:2')
    expect(CircuitBreaker.inspect('test:2').state).toBe('OPEN')
    expect(() => CircuitBreaker.ensureClosed('test:2')).toThrow(CircuitOpenError)
  })

  it('transita para HALF_OPEN apos janela expirar', () => {
    CircuitBreaker.recordFailure('test:3', { failureThreshold: 2, openMs: 1 })
    CircuitBreaker.recordFailure('test:3', { failureThreshold: 2, openMs: 1 })
    expect(CircuitBreaker.inspect('test:3').state).toBe('OPEN')

    // Esperar janela passar
    const after = Date.now() + 10
    jest.useFakeTimers({ now: after })
    try {
      expect(() => CircuitBreaker.ensureClosed('test:3')).not.toThrow()
      expect(CircuitBreaker.inspect('test:3').state).toBe('HALF_OPEN')
    } finally {
      jest.useRealTimers()
    }
  })

  it('recordSuccess reseta para CLOSED', () => {
    CircuitBreaker.recordFailure('test:4')
    CircuitBreaker.recordSuccess('test:4')
    expect(CircuitBreaker.inspect('test:4').failures).toBe(0)
    expect(CircuitBreaker.inspect('test:4').state).toBe('CLOSED')
  })

  it('falha em HALF_OPEN reabre imediatamente', () => {
    CircuitBreaker.recordFailure('test:5', { failureThreshold: 1, openMs: 1 })
    jest.useFakeTimers({ now: Date.now() + 10 })
    try {
      CircuitBreaker.ensureClosed('test:5')
      expect(CircuitBreaker.inspect('test:5').state).toBe('HALF_OPEN')
      CircuitBreaker.recordFailure('test:5', { failureThreshold: 1, openMs: 1 })
      expect(CircuitBreaker.inspect('test:5').state).toBe('OPEN')
    } finally {
      jest.useRealTimers()
    }
  })
})
