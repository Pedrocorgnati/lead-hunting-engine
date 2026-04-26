import { sanitizeRedirect } from '../sanitize-redirect'

describe('sanitizeRedirect (TASK-6 / CL-189)', () => {
  it('aceita caminhos internos validos', () => {
    expect(sanitizeRedirect('/leads/abc')).toBe('/leads/abc')
    expect(sanitizeRedirect('/dashboard')).toBe('/dashboard')
    expect(sanitizeRedirect('/admin/metricas?tab=foo')).toBe('/admin/metricas?tab=foo')
  })

  it('rejeita URL externa', () => {
    expect(sanitizeRedirect('https://evil.com')).toBe('/dashboard')
    expect(sanitizeRedirect('http://evil.com/leads')).toBe('/dashboard')
  })

  it('rejeita protocol-relative URL', () => {
    expect(sanitizeRedirect('//evil.com')).toBe('/dashboard')
  })

  it('rejeita strings sem barra inicial', () => {
    expect(sanitizeRedirect('leads/abc')).toBe('/dashboard')
    expect(sanitizeRedirect('')).toBe('/dashboard')
  })

  it('rejeita paths de api e loop de login', () => {
    expect(sanitizeRedirect('/api/v1/leads')).toBe('/dashboard')
    expect(sanitizeRedirect('/login?foo=1')).toBe('/dashboard')
  })

  it('lida com null/undefined', () => {
    expect(sanitizeRedirect(null)).toBe('/dashboard')
    expect(sanitizeRedirect(undefined)).toBe('/dashboard')
  })

  it('respeita fallback customizado', () => {
    expect(sanitizeRedirect(null, '/inicio')).toBe('/inicio')
    expect(sanitizeRedirect('https://evil.com', '/inicio')).toBe('/inicio')
  })
})
