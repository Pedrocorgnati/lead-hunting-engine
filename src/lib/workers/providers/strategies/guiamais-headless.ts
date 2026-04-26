import type { Page } from 'playwright'
import { HeadlessScraper } from '../headless-scraper'
import { humanDelay } from '../anti-bot'
import type { BusinessResult } from '../types'

const GUIAMAIS_BASE = 'https://www.guiamais.com.br/encontre'

export class GuiaMaisStrategy {
  private scraper = new HeadlessScraper()

  async search(term: string, location: string, maxResults = 20): Promise<BusinessResult[]> {
    await this.scraper.launch()

    try {
      return await this.scraper.withPage(async (page: Page) => {
        const url = `${GUIAMAIS_BASE}?q=${encodeURIComponent(term)}&l=${encodeURIComponent(location)}`
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        await humanDelay(1500, 3000)

        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => window.scrollBy(0, 800))
          await humanDelay(600, 1100)
        }

        const cards = await page
          .locator('article.listing, li.listing-item, [data-testid="listing-card"]')
          .all()
        const results: BusinessResult[] = []

        for (const card of cards.slice(0, maxResults)) {
          try {
            const name =
              (await card.locator('h2, h3, a.listing-name').first().textContent({ timeout: 1500 })) ?? ''
            if (!name.trim()) continue

            const address = await card
              .locator('[class*="address"], address')
              .first()
              .textContent({ timeout: 1000 })
              .catch(() => null)
            const phone = await card
              .locator('[href^="tel:"]')
              .getAttribute('href', { timeout: 1000 })
              .catch(() => null)
            const website = await card
              .locator('a[href^="http"]:not([href*="guiamais.com.br"])')
              .first()
              .getAttribute('href', { timeout: 1000 })
              .catch(() => null)
            const category = await card
              .locator('[class*="category"], .listing-category')
              .first()
              .textContent({ timeout: 1000 })
              .catch(() => null)

            results.push({
              externalId: `guiamais-headless:${name.trim()}:${address ?? ''}`,
              name: name.trim(),
              address: address?.trim() ?? null,
              city: location,
              state: null,
              phone: phone?.replace('tel:', '').trim() ?? null,
              website: website ?? null,
              category: category?.trim() ?? null,
              rating: null,
              reviewCount: null,
              lat: null,
              lng: null,
              openNow: null,
              priceLevel: null,
              source: 'guiamais-headless',
              rawJson: { term, location, scraped: true },
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
