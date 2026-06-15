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

  describe('extractedNumbers', () => {
    it('extrai numero de wa.me com +55', () => {
      const r = detectWhatsapp({ html: '<a href="https://wa.me/+5511999998888">Fale</a>' })
      expect(r.extractedNumbers).toEqual(['+5511999998888'])
    })

    it('extrai numero de wa.me sem + e normaliza para +<digitos>', () => {
      const r = detectWhatsapp({ html: '<a href="https://wa.me/5511999998888">Fale</a>' })
      expect(r.extractedNumbers).toEqual(['+5511999998888'])
    })

    it('extrai numero de api.whatsapp.com com %2B', () => {
      const r = detectWhatsapp({
        html: '<a href="https://api.whatsapp.com/send?phone=%2B5511988887777">WA</a>',
      })
      expect(r.extractedNumbers).toEqual(['+5511988887777'])
    })

    it('extrai phone mesmo quando nao e o primeiro parametro da query', () => {
      const r = detectWhatsapp({
        html: '<a href="https://api.whatsapp.com/send?text=oi&phone=5511988887777">WA</a>',
      })
      expect(r.extractedNumbers).toEqual(['+5511988887777'])
    })

    it('tolera ate 2 separadores ignoraveis no numero', () => {
      const r = detectWhatsapp({
        html: '<a href="https://wa.me/55-11-999998888">Fale</a>',
      })
      expect(r.extractedNumbers).toEqual(['+5511999998888'])
    })

    it('captura numeros divergentes em dois links distintos', () => {
      const html = `
        <a href="https://wa.me/5511999998888">Vendas</a>
        <a href="https://api.whatsapp.com/send?phone=5521988887777">Suporte</a>
      `
      const r = detectWhatsapp({ html })
      expect(r.extractedNumbers).toEqual(['+5511999998888', '+5521988887777'])
    })

    it('deduplica o mesmo numero em links diferentes', () => {
      const html = `
        <a href="https://wa.me/+5511999998888">A</a>
        <a href="https://api.whatsapp.com/send?phone=%2B5511999998888">B</a>
      `
      const r = detectWhatsapp({ html })
      expect(r.extractedNumbers).toEqual(['+5511999998888'])
    })

    it('ignora link malformado (wa.me/abc) sem lancar', () => {
      const r = detectWhatsapp({ html: '<a href="https://wa.me/abc">Fale</a>' })
      expect(r.extractedNumbers).toEqual([])
    })

    it('ignora numero fora do range E.164 (8-15 digitos)', () => {
      const html = `
        <a href="https://wa.me/1234567">curto</a>
        <a href="https://wa.me/1234567890123456">longo</a>
      `
      const r = detectWhatsapp({ html })
      expect(r.extractedNumbers).toEqual([])
    })

    it('ignora numero com mais de 2 separadores', () => {
      const r = detectWhatsapp({ html: '<a href="https://wa.me/55-11-99999-8888">Fale</a>' })
      expect(r.extractedNumbers).toEqual([])
    })

    it('nao captura numero apos ? ou # no path do wa.me', () => {
      const r = detectWhatsapp({
        html: '<a href="https://wa.me/5511999998888?text=ola">Fale</a>',
      })
      expect(r.extractedNumbers).toEqual(['+5511999998888'])
    })

    it('retorna vazio para HTML sem links de WhatsApp', () => {
      const r = detectWhatsapp({ html: '<p>Pagina institucional sem contato</p>' })
      expect(r.extractedNumbers).toEqual([])
    })

    it('retorna vazio no early-return (sem html e sem phone)', () => {
      const r = detectWhatsapp({ html: '', phone: null })
      expect(r.extractedNumbers).toEqual([])
    })

    it('nao altera a semantica de confidence/evidence existente', () => {
      const r = detectWhatsapp({ html: '<a href="https://wa.me/5511999998888">Fale</a>' })
      expect(r.isWhatsappChannel).toBe(true)
      expect(r.evidence).toContain('wa.me-link')
      expect(r.confidence).toBeGreaterThanOrEqual(0.5)
    })
  })
})
