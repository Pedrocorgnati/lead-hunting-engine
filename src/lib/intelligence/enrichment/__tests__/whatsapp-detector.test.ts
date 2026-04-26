import { detectWhatsapp } from '../enrichers/whatsapp-detector'

describe('detectWhatsapp', () => {
  it('retorna falso para html vazio e sem telefone', () => {
    const r = detectWhatsapp({ html: '', phone: null })
    expect(r.isWhatsappChannel).toBe(false)
    expect(r.evidence).toEqual([])
  })

  it('detecta link wa.me', () => {
    const r = detectWhatsapp({ html: '<a href="https://wa.me/5511999999999">Fale</a>' })
    expect(r.isWhatsappChannel).toBe(true)
    expect(r.evidence).toContain('wa.me-link')
    expect(r.confidence).toBeGreaterThanOrEqual(0.5)
  })

  it('detecta api.whatsapp.com/send', () => {
    const r = detectWhatsapp({ html: '<a href="https://api.whatsapp.com/send?phone=5511999">WA</a>' })
    expect(r.isWhatsappChannel).toBe(true)
    expect(r.evidence).toContain('api.whatsapp.com-link')
  })

  it('detecta "chame no WhatsApp" via texto', () => {
    const r = detectWhatsapp({ html: '<p>Chame no WhatsApp para atendimento!</p>' })
    expect(r.isWhatsappChannel).toBe(true)
    expect(r.evidence).toContain('text-chame-whatsapp')
  })

  it('detecta botao flutuante por classe', () => {
    const r = detectWhatsapp({ html: '<div class="btn-whatsapp">WA</div>' })
    expect(r.isWhatsappChannel).toBe(true)
    expect(r.evidence).toContain('float-button')
  })

  it('detecta heuristica tel: sem formulario', () => {
    const r = detectWhatsapp({
      html: '<a href="tel:+5511999999999">Ligue</a>',
      hasContactForm: false,
    })
    expect(r.evidence).toContain('tel-link-without-form')
  })

  it('nao dispara heuristica tel: se ha formulario de contato', () => {
    const r = detectWhatsapp({
      html: '<a href="tel:+5511999999999">Ligue</a>',
      hasContactForm: true,
    })
    expect(r.evidence).not.toContain('tel-link-without-form')
  })

  it('confidence nunca excede 1', () => {
    const html = `
      <a href="https://wa.me/5511999999999">WA</a>
      <p>Chame no WhatsApp! Atendimento via WhatsApp.</p>
      <div class="btn-whatsapp"></div>
      <a href="tel:+5511999999999"></a>
    `
    const r = detectWhatsapp({ html, hasContactForm: false })
    expect(r.confidence).toBeLessThanOrEqual(1)
  })
})
