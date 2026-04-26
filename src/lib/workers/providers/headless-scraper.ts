import type { Browser, BrowserContext, Page } from 'playwright'
import { randomUA, randomViewport, applyStealth, getProxyConfig, isHeadlessEnabled } from './anti-bot'

export class HeadlessScraper {
  private browser: Browser | null = null
  private context: BrowserContext | null = null

  async launch(): Promise<void> {
    if (!isHeadlessEnabled()) throw new Error('HEADLESS_DISABLED: scraper desativado via config')

    // Dynamic import to avoid breaking environments without Playwright
    const { chromium } = await import('playwright')

    const proxy = getProxyConfig()
    this.browser = await chromium.launch({
      headless: true,
      proxy,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })

    const ua = randomUA()
    const viewport = randomViewport()

    this.context = await this.browser.newContext({
      userAgent: ua,
      viewport,
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
    })

    await applyStealth(this.context)
  }

  async withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    if (!this.context) throw new Error('HeadlessScraper: nao inicializado. Chame launch() primeiro')
    const page = await this.context.newPage()
    try {
      return await fn(page)
    } finally {
      await page.close()
    }
  }

  async close(): Promise<void> {
    await this.context?.close()
    await this.browser?.close()
    this.context = null
    this.browser = null
  }
}
