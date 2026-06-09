import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(__dirname, '../error-boundary.tsx'), 'utf8')

describe('ErrorBoundary seguro', () => {
  it('nao renderiza mensagem tecnica do erro', () => {
    expect(source).not.toContain('error?.message')
    expect(source).not.toContain('this.state.error')
  })

  it('expoe correlation id copiavel, retry e report sanitizado', () => {
    expect(source).toContain('Correlation ID:')
    expect(source).toContain('Copiar ID')
    expect(source).toContain('Tentar novamente')
    expect(source).toContain('/api/v1/errors/report')
    expect(source).not.toContain('error.stack')
  })
})
