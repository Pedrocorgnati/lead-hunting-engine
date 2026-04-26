import { detectAnalyticsPixels } from '../enrichers/analytics-pixels-detector'

describe('detectAnalyticsPixels', () => {
  it('retorna array vazio para html vazio', () => {
    const r = detectAnalyticsPixels({ html: '' })
    expect(r.analyticsPixels).toEqual([])
  })

  it('detecta GA4', () => {
    const html = `<script>gtag('config', 'G-ABC12345');</script>`
    expect(detectAnalyticsPixels({ html }).analyticsPixels).toContain('ga4')
  })

  it('detecta Meta Pixel', () => {
    const html = `<script>fbq('init', '1234567890');</script>`
    expect(detectAnalyticsPixels({ html }).analyticsPixels).toContain('meta')
  })

  it('detecta TikTok Pixel', () => {
    const html = `<script>ttq.load('PIXELID');</script>`
    expect(detectAnalyticsPixels({ html }).analyticsPixels).toContain('tiktok')
  })

  it('detecta Hotjar', () => {
    const html = `<script>var h={hjid:1234567,hjsv:6};</script>`
    expect(detectAnalyticsPixels({ html }).analyticsPixels).toContain('hotjar')
  })

  it('detecta GTM', () => {
    const html = `<script src="https://www.googletagmanager.com/gtm.js?id=GTM-XYZ123"></script>`
    expect(detectAnalyticsPixels({ html }).analyticsPixels).toContain('gtm')
  })

  it('detecta multiplos pixels simultaneos', () => {
    const html = `
      <script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC"></script>
      <script>fbq('init', '123');</script>
      <script>gtag('config', 'G-ZZZ');</script>
    `
    const r = detectAnalyticsPixels({ html })
    expect(r.analyticsPixels).toEqual(expect.arrayContaining(['ga4', 'meta', 'gtm']))
  })
})
