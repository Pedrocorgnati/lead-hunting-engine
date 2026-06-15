/**
 * Testes unitarios do utilitario SSRF-safe (sem rede real):
 * `node:dns/promises`, `node:http` e `node:https` sao mockados.
 *
 * Review 06-11 R2-1 (DNS rebinding/TOCTOU): a propriedade central testada e o
 * PIN do IP — a conexao TCP usa o IP retornado pela validacao (host = IP),
 * com header Host e SNI do hostname original, em TODOS os hops. Nao existe
 * segunda resolucao DNS que um dominio com TTL 0 possa explorar.
 */
import { EventEmitter } from 'node:events'
import { lookup } from 'node:dns/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isBlockedIp, hostIsSafe, resolvePinnedIp, safeFetchHtml } from '../safe-fetch-html'

jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(),
}))
jest.mock('node:http', () => ({
  request: jest.fn(),
}))
jest.mock('node:https', () => ({
  request: jest.fn(),
}))

const lookupMock = lookup as unknown as jest.Mock
const httpRequestMock = httpRequest as unknown as jest.Mock
const httpsRequestMock = httpsRequest as unknown as jest.Mock

const PUBLIC_IP = '93.184.216.34'
const PUBLIC_IP_2 = '93.184.216.35'

// ─── fakes de req/res do node:http ──────────────────────────────────────────

class FakeResponse extends EventEmitter {
  destroyed = false
  constructor(
    public statusCode: number,
    public headers: Record<string, string>,
    private chunks: string[] = [],
  ) {
    super()
  }
  resume(): this {
    return this
  }
  destroy(): this {
    this.destroyed = true
    return this
  }
  /** Emite o corpo em chunks (apos os listeners estarem anexados). */
  emitBody(): void {
    for (const chunk of this.chunks) {
      if (this.destroyed) return
      this.emit('data', Buffer.from(chunk))
    }
    if (!this.destroyed) this.emit('end')
  }
}

class FakeRequest extends EventEmitter {
  end = jest.fn()
  destroy(err?: Error): this {
    if (err) this.emit('error', err)
    return this
  }
}

function htmlResponse(chunks: string[], contentType = 'text/html; charset=utf-8'): FakeResponse {
  return new FakeResponse(200, { 'content-type': contentType }, chunks)
}

function redirectResponse(location?: string): FakeResponse {
  return new FakeResponse(301, location ? { location } : {})
}

/**
 * Configura o mock de request: cada chamada consome o proximo item da fila.
 * FakeResponse = resposta entregue ao callback; Error = falha de conexao
 * (timeout/reset) emitida como 'error' no req.
 */
function queueResponses(mock: jest.Mock, outcomes: Array<FakeResponse | Error>): void {
  let call = 0
  mock.mockImplementation((_options: unknown, cb: (res: FakeResponse) => void) => {
    const outcome = outcomes[Math.min(call, outcomes.length - 1)]
    call++
    const req = new FakeRequest()
    if (outcome instanceof Error) {
      setImmediate(() => req.emit('error', outcome))
    } else {
      setImmediate(() => {
        cb(outcome)
        setImmediate(() => outcome.emitBody())
      })
    }
    return req
  })
}

beforeEach(() => {
  lookupMock.mockReset()
  httpRequestMock.mockReset()
  httpsRequestMock.mockReset()
  // default: todo hostname resolve para IP publico
  lookupMock.mockResolvedValue([{ address: PUBLIC_IP, family: 4 }])
})

describe('isBlockedIp', () => {
  it.each([
    '10.0.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '192.168.1.1',
    '100.64.0.1',
  ])('bloqueia IPv4 privado/reservado %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(true)
  })

  it.each(['::1', 'fe80::1', 'fc00::1', 'fd12:3456::1'])(
    'bloqueia IPv6 loopback/link-local/ULA %s',
    (ip) => {
      expect(isBlockedIp(ip)).toBe(true)
    }
  )

  it('bloqueia IPv4-mapped privado ::ffff:127.0.0.1', () => {
    expect(isBlockedIp('::ffff:127.0.0.1')).toBe(true)
  })

  it('permite IPv4-mapped publico ::ffff:8.8.8.8', () => {
    expect(isBlockedIp('::ffff:8.8.8.8')).toBe(false)
  })

  it('bloqueia IPv6 publico de forma conservadora', () => {
    expect(isBlockedIp('2001:4860:4860::8888')).toBe(true)
  })

  it('permite IPv4 publico', () => {
    expect(isBlockedIp('8.8.8.8')).toBe(false)
    expect(isBlockedIp(PUBLIC_IP)).toBe(false)
  })

  it('bloqueia input que nao e IP', () => {
    expect(isBlockedIp('not-an-ip')).toBe(true)
  })
})

describe('hostIsSafe / resolvePinnedIp', () => {
  it('aceita IP literal publico sem consultar DNS', async () => {
    await expect(hostIsSafe('8.8.8.8')).resolves.toBe(true)
    await expect(resolvePinnedIp('8.8.8.8')).resolves.toBe('8.8.8.8')
    expect(lookupMock).not.toHaveBeenCalled()
  })

  it('rejeita IP literal privado', async () => {
    await expect(hostIsSafe('192.168.0.10')).resolves.toBe(false)
    await expect(resolvePinnedIp('192.168.0.10')).resolves.toBeNull()
  })

  it('aceita hostname que resolve apenas para IPs publicos e pina o primeiro registro', async () => {
    await expect(hostIsSafe('example.com')).resolves.toBe(true)
    await expect(resolvePinnedIp('example.com')).resolves.toBe(PUBLIC_IP)
    expect(lookupMock).toHaveBeenCalledWith('example.com', { all: true })
  })

  // Politica dual-stack (E2E 06-12): com o connect PINADO, registros extras
  // nunca sao usados — o pin escolhe o primeiro IPv4 PUBLICO. Um atacante que
  // mistura registro privado no set nao ganha nada: o IP privado jamais e
  // conectado.
  it('pina o primeiro IPv4 publico mesmo com registro privado misturado no set', async () => {
    lookupMock.mockResolvedValue([
      { address: '10.0.0.5', family: 4 },
      { address: PUBLIC_IP, family: 4 },
    ])
    await expect(hostIsSafe('evil.example.com')).resolves.toBe(true)
    await expect(resolvePinnedIp('evil.example.com')).resolves.toBe(PUBLIC_IP)
  })

  it('pina o IPv4 publico em host dual-stack (AAAA presente e ignorado)', async () => {
    lookupMock.mockResolvedValue([
      { address: '2606:4700::6810:84e5', family: 6 },
      { address: PUBLIC_IP, family: 4 },
    ])
    await expect(resolvePinnedIp('dualstack.example.com')).resolves.toBe(PUBLIC_IP)
  })

  it('rejeita host IPv6-only (conexao nunca usa IPv6)', async () => {
    lookupMock.mockResolvedValue([{ address: '2606:4700::6810:84e5', family: 6 }])
    await expect(hostIsSafe('v6only.example.com')).resolves.toBe(false)
    await expect(resolvePinnedIp('v6only.example.com')).resolves.toBeNull()
  })

  it('rejeita hostname cujo unico IPv4 e privado', async () => {
    lookupMock.mockResolvedValue([
      { address: '10.0.0.5', family: 4 },
      { address: '2606:4700::6810:84e5', family: 6 },
    ])
    await expect(hostIsSafe('interno.example.com')).resolves.toBe(false)
    await expect(resolvePinnedIp('interno.example.com')).resolves.toBeNull()
  })

  it('rejeita hostname sem registros DNS', async () => {
    lookupMock.mockResolvedValue([])
    await expect(hostIsSafe('vazio.example.com')).resolves.toBe(false)
  })

  it('rejeita hostname quando o lookup falha', async () => {
    lookupMock.mockRejectedValue(new Error('ENOTFOUND'))
    await expect(hostIsSafe('nao-existe.example.com')).resolves.toBe(false)
  })
})

describe('safeFetchHtml — pin do IP validado (anti-rebinding R2-1)', () => {
  it('conecta no IP pinado com Host e SNI do hostname original (https)', async () => {
    queueResponses(httpsRequestMock, [htmlResponse(['<html>ok</html>'])])

    await expect(safeFetchHtml('https://example.com/contato')).resolves.toBe('<html>ok</html>')

    expect(httpsRequestMock).toHaveBeenCalledTimes(1)
    const options = httpsRequestMock.mock.calls[0][0]
    // conexao TCP vai para o IP pre-validado — NUNCA para o hostname (que um
    // DNS hostil com TTL 0 poderia re-resolver para 169.254.169.254)
    expect(options.host).toBe(PUBLIC_IP)
    expect(options.port).toBe(443)
    expect(options.path).toBe('/contato')
    expect(options.headers.Host).toBe('example.com')
    // SNI/validacao de certificado contra o dominio original, nao o IP
    expect(options.servername).toBe('example.com')
  })

  it('http:// usa node:http na porta 80, pinando o IP e sem servername', async () => {
    queueResponses(httpRequestMock, [htmlResponse(['<html>ok</html>'])])

    await expect(safeFetchHtml('http://example.com')).resolves.toBe('<html>ok</html>')

    const options = httpRequestMock.mock.calls[0][0]
    expect(options.host).toBe(PUBLIC_IP)
    expect(options.port).toBe(80)
    expect(options.headers.Host).toBe('example.com')
    expect(options.servername).toBeUndefined()
    expect(httpsRequestMock).not.toHaveBeenCalled()
  })

  it('adiciona https:// quando a url nao tem protocolo', async () => {
    queueResponses(httpsRequestMock, [htmlResponse(['<html>ok</html>'])])
    await expect(safeFetchHtml('example.com')).resolves.toBe('<html>ok</html>')
    expect(httpsRequestMock.mock.calls[0][0].headers.Host).toBe('example.com')
  })

  it('redirect re-resolve e re-pina o IP do novo host a cada hop', async () => {
    lookupMock.mockImplementation(async (hostname: string) =>
      hostname === 'outro.example.com'
        ? [{ address: PUBLIC_IP_2, family: 4 }]
        : [{ address: PUBLIC_IP, family: 4 }]
    )
    queueResponses(httpsRequestMock, [
      redirectResponse('https://outro.example.com/destino'),
      htmlResponse(['<html>destino</html>']),
    ])

    await expect(safeFetchHtml('https://example.com')).resolves.toBe('<html>destino</html>')

    expect(httpsRequestMock).toHaveBeenCalledTimes(2)
    const hop2 = httpsRequestMock.mock.calls[1][0]
    expect(hop2.host).toBe(PUBLIC_IP_2)
    expect(hop2.headers.Host).toBe('outro.example.com')
    expect(hop2.servername).toBe('outro.example.com')
  })
})

describe('safeFetchHtml — validacoes e limites', () => {
  it('retorna null para url invalida', async () => {
    await expect(safeFetchHtml('http://')).resolves.toBeNull()
    expect(httpRequestMock).not.toHaveBeenCalled()
    expect(httpsRequestMock).not.toHaveBeenCalled()
  })

  it('bloqueia host que resolve para IP privado sem abrir conexao', async () => {
    lookupMock.mockResolvedValue([{ address: '192.168.1.10', family: 4 }])
    await expect(safeFetchHtml('https://interno.example.com')).resolves.toBeNull()
    expect(httpsRequestMock).not.toHaveBeenCalled()
  })

  it('bloqueia redirect para host que resolve para IP privado', async () => {
    lookupMock.mockImplementation(async (hostname: string) =>
      hostname === 'evil.internal'
        ? [{ address: '169.254.169.254', family: 4 }]
        : [{ address: PUBLIC_IP, family: 4 }]
    )
    queueResponses(httpsRequestMock, [redirectResponse('https://evil.internal/metadata')])

    await expect(safeFetchHtml('https://example.com')).resolves.toBeNull()
    // o segundo hop e barrado ANTES de qualquer conexao ao host privado
    expect(httpsRequestMock).toHaveBeenCalledTimes(1)
  })

  it('retorna null apos exceder maxRedirects (default 3)', async () => {
    queueResponses(httpsRequestMock, [redirectResponse('https://example.com/proximo')])
    await expect(safeFetchHtml('https://example.com')).resolves.toBeNull()
    // hops 0..3 conectam e todos redirecionam; o 4o redirect estoura o limite
    expect(httpsRequestMock).toHaveBeenCalledTimes(4)
  })

  it('retorna null quando o redirect nao tem header location', async () => {
    queueResponses(httpsRequestMock, [redirectResponse()])
    await expect(safeFetchHtml('https://example.com')).resolves.toBeNull()
  })

  it('retorna null para content-type nao-HTML', async () => {
    queueResponses(httpsRequestMock, [htmlResponse(['{"a":1}'], 'application/json')])
    await expect(safeFetchHtml('https://example.com')).resolves.toBeNull()
  })

  it('aceita content-type application/xhtml+xml', async () => {
    queueResponses(httpsRequestMock, [htmlResponse(['<html>xhtml</html>'], 'application/xhtml+xml')])
    await expect(safeFetchHtml('https://example.com')).resolves.toBe('<html>xhtml</html>')
  })

  it('trunca corpo acima de maxBytes retornando o parcial acumulado', async () => {
    const response = htmlResponse(['12345678', 'ABCDEFGH'])
    queueResponses(httpsRequestMock, [response])
    // maxBytes 10: o primeiro chunk (8 bytes) cabe; o segundo estoura e e descartado
    await expect(safeFetchHtml('https://example.com', { maxBytes: 10 })).resolves.toBe('12345678')
    expect(response.destroyed).toBe(true)
  })

  it('retorna null em timeout/erro de conexao', async () => {
    queueResponses(httpsRequestMock, [Object.assign(new Error('aborted'), { name: 'TimeoutError' })])
    await expect(safeFetchHtml('https://example.com')).resolves.toBeNull()
  })
})

describe('safeFetchHtml — falha no meio do streaming do corpo (R2-6)', () => {
  it('retorna null sem lancar quando a segunda leitura do corpo falha (erro mid-stream)', async () => {
    // Equivalente ao "reader.read() que rejeita na segunda chamada": o
    // primeiro chunk chega bem e o stream erra no meio do corpo.
    const response = new FakeResponse(200, { 'content-type': 'text/html' })
    response.emitBody = () => {
      response.emit('data', Buffer.from('<html>parcial'))
      response.emit('error', new Error('ECONNRESET no meio do corpo'))
    }
    queueResponses(httpsRequestMock, [response])

    await expect(safeFetchHtml('https://example.com')).resolves.toBeNull()
  })

  it('retorna null sem lancar quando o processamento do chunk lanca excecao sincrona', async () => {
    // Excecao DENTRO do loop de leitura (nao um evento 'error' do stream):
    // sem o try/catch do R2-6 isso viraria uncaught exception no emit.
    const poisoned = {
      get length(): number {
        throw new Error('chunk inesperado durante o streaming')
      },
    }
    const response = new FakeResponse(200, { 'content-type': 'text/html' })
    response.emitBody = () => {
      response.emit('data', Buffer.from('<html>'))
      if (!response.destroyed) response.emit('data', poisoned)
      if (!response.destroyed) response.emit('end')
    }
    queueResponses(httpsRequestMock, [response])

    await expect(safeFetchHtml('https://example.com')).resolves.toBeNull()
    // O response e cancelado best-effort apos a falha.
    expect(response.destroyed).toBe(true)
  })
})
