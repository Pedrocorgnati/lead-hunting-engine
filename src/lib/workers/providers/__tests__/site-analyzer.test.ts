import { analyzeSite } from '../site-analyzer'

describe('analyzeSite — SSRF prevention', () => {
  it('bloqueia localhost', async () => {
    const result = await analyzeSite('http://localhost:3000')
    expect(result.reachable).toBe(false)
    expect(result.httpStatus).toBe(403)
  })

  it('bloqueia IP privado 127.x', async () => {
    const result = await analyzeSite('http://127.0.0.1')
    expect(result.reachable).toBe(false)
    expect(result.httpStatus).toBe(403)
  })

  it('bloqueia IP privado 10.x', async () => {
    const result = await analyzeSite('http://10.0.0.1')
    expect(result.reachable).toBe(false)
    expect(result.httpStatus).toBe(403)
  })

  it('bloqueia IP privado 192.168.x', async () => {
    const result = await analyzeSite('http://192.168.1.1')
    expect(result.reachable).toBe(false)
    expect(result.httpStatus).toBe(403)
  })

  it('bloqueia IP privado 172.16.x', async () => {
    const result = await analyzeSite('http://172.16.0.1')
    expect(result.reachable).toBe(false)
    expect(result.httpStatus).toBe(403)
  })

  it('retorna reachable: false para URL vazia', async () => {
    const result = await analyzeSite('')
    expect(result.reachable).toBe(false)
  })

  it('retorna reachable: false para URL curta', async () => {
    const result = await analyzeSite('ab')
    expect(result.reachable).toBe(false)
  })
})
