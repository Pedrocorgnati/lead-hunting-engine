import { detectEcommerce } from '../enrichers/ecommerce-detector'

describe('detectEcommerce', () => {
  it('retorna false para html e url vazios', () => {
    const r = detectEcommerce({ html: '', url: '' })
    expect(r.hasEcommerce).toBe(false)
    expect(r.platform).toBeNull()
  })

  it('detecta Shopify', () => {
    const r = detectEcommerce({ html: '<script src="//cdn.shopify.com/s/files/..."></script>' })
    expect(r.hasEcommerce).toBe(true)
    expect(r.platform).toBe('shopify')
  })

  it('detecta WooCommerce', () => {
    const r = detectEcommerce({ html: '<link rel="stylesheet" href="/wp-content/plugins/woocommerce/assets/css/foo.css">' })
    expect(r.hasEcommerce).toBe(true)
    expect(r.platform).toBe('woocommerce')
  })

  it('detecta VTEX por dominio', () => {
    const r = detectEcommerce({ html: '<img src="https://example.vtexassets.com/foo.jpg">' })
    expect(r.hasEcommerce).toBe(true)
    expect(r.platform).toBe('vtex')
  })

  it('detecta Nuvemshop', () => {
    const r = detectEcommerce({ html: '<script>window.LS = {}; </script>', url: 'https://loja.nuvemshop.com.br' })
    expect(r.hasEcommerce).toBe(true)
    expect(r.platform).toBe('nuvemshop')
  })

  it('detecta generic via markers de carrinho sem plataforma identificada', () => {
    const html = `
      <a href="/cart">Carrinho</a>
      <button class="add-to-cart">Adicionar ao carrinho</button>
    `
    const r = detectEcommerce({ html })
    expect(r.hasEcommerce).toBe(true)
    expect(r.platform).toBe('generic')
  })

  it('nao dispara com apenas um marker fraco sem plataforma', () => {
    const r = detectEcommerce({ html: '<p>vamos ao checkout em breve</p>' })
    expect(r.hasEcommerce).toBe(false)
  })
})
