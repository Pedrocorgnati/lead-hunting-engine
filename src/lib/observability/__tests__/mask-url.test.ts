import { maskUrlSecrets } from '../mask-url'

describe('maskUrlSecrets (H-01/H-02)', () => {
  it('mascara key/apiKey/access_token em query string', () => {
    expect(maskUrlSecrets('https://maps.googleapis.com/x?key=AIzaSECRET&q=test')).toBe(
      'https://maps.googleapis.com/x?key=***&q=test',
    )
    expect(maskUrlSecrets('https://api.tomtom.com/s?q=a&apiKey=ABC123')).toContain('apiKey=***')
    expect(maskUrlSecrets('https://api.tomtom.com/s?q=a&apiKey=ABC123')).not.toContain('ABC123')
    expect(maskUrlSecrets('https://graph.facebook.com/me?access_token=XYZ&fields=id')).toContain('access_token=***')
  })

  it('mascara user:pass@ de URL de proxy', () => {
    expect(maskUrlSecrets('http://user:pass@proxy.local:8080/path')).toBe('http://***:***@proxy.local:8080/path')
  })

  it('preserva URL sem segredo', () => {
    expect(maskUrlSecrets('https://example.com/path?q=1&page=2')).toBe('https://example.com/path?q=1&page=2')
  })

  it('fallback por regex para string nao-URL (ex.: mensagem de erro)', () => {
    const out = maskUrlSecrets('Erro de conexão: fetch https://x/y?key=SUPERSECRET falhou')
    expect(out).toContain('key=***')
    expect(out).not.toContain('SUPERSECRET')
  })

  it('string vazia e no-op', () => {
    expect(maskUrlSecrets('')).toBe('')
  })
})
