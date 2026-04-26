import { analyzeUx } from '../enrichers/ux-analyzer'

describe('analyzeUx', () => {
  it('html vazio retorna score 0 e todos os sinais false', () => {
    const r = analyzeUx({ html: '' })
    expect(r.score).toBe(0)
    expect(r.matched).toEqual([])
    expect(r.signals.pageLoadTimeSec).toBeNull()
  })

  it('detecta carrinho por link e classe', () => {
    const html = `<a href="/cart">Adicionar ao carrinho</a>`
    const r = analyzeUx({ html })
    expect(r.signals.hasCart).toBe(true)
  })

  it('detecta busca', () => {
    const html = `<input type="search" name="q" />`
    expect(analyzeUx({ html }).signals.hasSearch).toBe(true)
  })

  it('detecta form de contato', () => {
    const html = `<form action="/contato"><input name="email" /><input name="mensagem" /></form>`
    expect(analyzeUx({ html }).signals.hasContactForm).toBe(true)
  })

  it('detecta widget de agendamento', () => {
    const html = `<a href="https://calendly.com/acme">Agendar</a>`
    expect(analyzeUx({ html }).signals.hasBookingWidget).toBe(true)
  })

  it('detecta live chat (tawk.to e whatsapp)', () => {
    expect(analyzeUx({ html: `<script src="https://embed.tawk.to/..."></script>` }).signals.hasLiveChat).toBe(true)
    expect(analyzeUx({ html: `<a href="https://wa.me/5511999999999">WA</a>` }).signals.hasLiveChat).toBe(true)
  })

  it('detecta CTA por classe e copy', () => {
    const html = `<button class="btn cta">Solicite seu orçamento</button>`
    expect(analyzeUx({ html }).signals.hasClearCTA).toBe(true)
  })

  it('detecta social links e analytics pixel', () => {
    const html = `<a href="https://instagram.com/acme"></a><script src="https://www.googletagmanager.com/gtag/js"></script>`
    const r = analyzeUx({ html })
    expect(r.signals.hasSocialLinks).toBe(true)
    expect(r.signals.hasAnalyticsPixel).toBe(true)
  })

  it('pageLoadTime bonus: <=1.5s soma 2, <=3s soma 1', () => {
    expect(analyzeUx({ html: '', loadTimeMs: 1200 }).score).toBe(2)
    expect(analyzeUx({ html: '', loadTimeMs: 2800 }).score).toBe(1)
    expect(analyzeUx({ html: '', loadTimeMs: 5000 }).score).toBe(0)
  })

  it('score limitado a 10 com todos sinais + load rapido', () => {
    const html = `
      <a href="/cart">comprar</a>
      <input type="search" name="q" />
      <form action="/contato"><input name="email" /></form>
      <a href="https://calendly.com/x">agendar</a>
      <script src="https://intercom.io"></script>
      <button class="cta">Fale conosco</button>
      <a href="https://facebook.com/x"></a>
      <script src="https://www.google-analytics.com/ga.js"></script>
    `
    const r = analyzeUx({ html, loadTimeMs: 800 })
    expect(r.score).toBe(10)
    expect(r.matched.length).toBe(8)
  })

  it('pageLoadTimeSec arredondado para 2 casas', () => {
    const r = analyzeUx({ html: '', loadTimeMs: 2345 })
    expect(r.signals.pageLoadTimeSec).toBe(2.35)
  })
})
