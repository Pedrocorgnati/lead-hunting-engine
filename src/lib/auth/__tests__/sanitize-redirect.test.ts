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

  // M2-6 / G2-006 — cobertura de cenarios cross-origin e injection vectors.
  describe('cross-origin / injection vectors (M2-6)', () => {
    it('rejeita javascript: scheme (XSS via redirect)', () => {
      expect(sanitizeRedirect('javascript:alert(1)')).toBe('/dashboard')
      // case variations
      expect(sanitizeRedirect('JaVaScRiPt:alert(1)')).toBe('/dashboard')
    })

    it('rejeita data: scheme', () => {
      expect(sanitizeRedirect('data:text/html,<script>alert(1)</script>')).toBe('/dashboard')
    })

    it('rejeita whitespace-prefixed external URLs', () => {
      // Helper trim() neutraliza o prefixo de tab/space comumente usado para bypass.
      expect(sanitizeRedirect('\thttps://evil.com')).toBe('/dashboard')
      expect(sanitizeRedirect('  //evil.com')).toBe('/dashboard')
    })

    it('rejeita query string com URL externa embutida', () => {
      // Comportamento defensivo do helper: qualquer "://" anywhere -> fallback.
      expect(sanitizeRedirect('/path?next=https://evil.com')).toBe('/dashboard')
      expect(sanitizeRedirect('/leads/abc?return=http://evil.com')).toBe('/dashboard')
    })

    it('rejeita URL-encoded protocol-relative (nao decodifica, retorna fallback)', () => {
      // %2F%2F nao comeca com '/' literal, entao cai no startsWith('/') check.
      expect(sanitizeRedirect('%2F%2Fevil.com')).toBe('/dashboard')
      expect(sanitizeRedirect('%2Fevil.com')).toBe('/dashboard')
    })

    it('caso edge: caminho com backslash nao e tratado como traversal cross-origin', () => {
      // Documenta comportamento atual: backslash dentro do path NAO e rejeitado.
      // Isso nao e bypass cross-origin (browser nao redireciona externamente),
      // mas pode quebrar normalizacao de path no cliente. Para fortalecer
      // posteriormente, adicionar `if (trimmed.includes('\\')) return fallback`.
      expect(sanitizeRedirect('/leads\\..\\admin')).toBe('/leads\\..\\admin')
    })
  })
})
