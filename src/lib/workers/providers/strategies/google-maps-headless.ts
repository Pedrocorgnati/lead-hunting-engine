import type { Page } from 'playwright'
import { HeadlessScraper } from '../headless-scraper'
import { humanDelay } from '../anti-bot'
import type { BusinessResult } from '../types'

const GOOGLE_MAPS_BASE = 'https://www.google.com/maps/search/'
const CARD_SELECTOR = '[data-result-index]'
const NAME_SELECTOR = '.fontHeadlineSmall'
const PHONE_SELECTOR = '[data-tooltip="Copiar número de telefone"]'

export interface HeadlessSearchParams {
  term: string
  region: string
  maxResults?: number
}

export class GoogleMapsStrategy {
  private scraper = new HeadlessScraper()

  async search(term: string, region: string, maxResults = 20): Promise<BusinessResult[]> {
    await this.scraper.launch()

    try {
      return await this.scraper.withPage(async (page: Page) => {
        const url = `${GOOGLE_MAPS_BASE}${encodeURIComponent(`${term} ${region}`)}`
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        await humanDelay(2000, 4000)

        // Dismiss consent dialogs (EU/BR)
        const consentBtn = page.locator('button[aria-label*="Aceitar"], button[aria-label*="Accept"]').first()
        if (await consentBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await consentBtn.click()
          await humanDelay(500, 1000)
        }

        // Scroll to load more results
        const listPanel = page.locator('[role="feed"]').first()
        let prevCount = 0
        for (let i = 0; i < 5; i++) {
          await listPanel.evaluate((el: Element) => (el as HTMLElement).scrollBy(0, 800))
          await humanDelay(800, 1500)
          const count = await page.locator(CARD_SELECTOR).count()
          if (count >= maxResults || count === prevCount) break
          prevCount = count
        }

        const cards = await page.locator(CARD_SELECTOR).all()
        const results: BusinessResult[] = []

        for (const card of cards.slice(0, maxResults)) {
          try {
            const name = await card.locator(NAME_SELECTOR).textContent({ timeout: 2000 }) ?? ''
            if (!name.trim()) continue

            const address = await card.locator('div[jsan*="address"]').textContent({ timeout: 1000 }).catch(() => null)
            const phone = await card.locator(PHONE_SELECTOR).getAttribute('data-value', { timeout: 1000 }).catch(() => null)
            const website = await card.locator('a[href*="http"][data-value]').getAttribute('href', { timeout: 1000 }).catch(() => null)

            results.push({
              externalId: `gmaps-headless:${name.trim()}:${address ?? ''}`,
              name: name.trim(),
              address: address?.trim() ?? null,
              city: region,
              state: null,
              phone: phone?.trim() ?? null,
              website: website ?? null,
              category: null,
              rating: null,
              reviewCount: null,
              lat: null,
              lng: null,
              openNow: null,
              priceLevel: null,
              source: 'google-maps-headless',
              rawJson: { term, region, scraped: true },
            })
          } catch {
            // skip malformed card
          }
        }

        return results
      })
    } finally {
      await this.scraper.close()
    }
  }
}
