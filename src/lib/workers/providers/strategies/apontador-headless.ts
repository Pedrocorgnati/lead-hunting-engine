import type { Page } from 'playwright'
import { HeadlessScraper } from '../headless-scraper'
import { humanDelay } from '../anti-bot'
import type { BusinessResult } from '../types'

const APONTADOR_BASE = 'https://www.apontador.com.br/busca'

export class ApontadorStrategy {
  private scraper = new HeadlessScraper()

  async search(term: string, location: string, maxResults = 20): Promise<BusinessResult[]> {
    await this.scraper.launch()

    try {
      return await this.scraper.withPage(async (page: Page) => {
        const url = `${APONTADOR_BASE}/${encodeURIComponent(term)}/${encodeURIComponent(location)}`
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        await humanDelay(1500, 3000)

        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => window.scrollBy(0, 800))
          await humanDelay(600, 1100)
        }

        const cards = await page.locator('[data-testid="poi-card"], article.poi-card, li.result-item').all()
        const results: BusinessResult[] = []

        for (const card of cards.slice(0, maxResults)) {
          try {
            const name =
              (await card.locator('h2, h3, a.poi-name').first().textContent({ timeout: 1500 })) ?? ''
            if (!name.trim()) continue

            const address = await card
              .locator('[class*="address"], address, .poi-address')
              .first()
              .textContent({ timeout: 1000 })
              .catch(() => null)
            const phone = await card
              .locator('[href^="tel:"]')
              .getAttribute('href', { timeout: 1000 })
              .catch(() => null)
            const website = await card
              .locator('a[href^="http"][target="_blank"]')
              .first()
              .getAttribute('href', { timeout: 1000 })
              .catch(() => null)
            const category = await card
              .locator('[class*="category"], .poi-category')
              .first()
              .textContent({ timeout: 1000 })
              .catch(() => null)
            const ratingText = await card
              .locator('[class*="rating"], [aria-label*="estrela"]')
              .first()
              .textContent({ timeout: 1000 })
              .catch(() => null)
            const rating = ratingText ? parseFloat(ratingText.replace(',', '.')) : null

            results.push({
              externalId: `apontador-headless:${name.trim()}:${address ?? ''}`,
              name: name.trim(),
              address: address?.trim() ?? null,
              city: location,
              state: null,
              phone: phone?.replace('tel:', '').trim() ?? null,
              website: website ?? null,
              category: category?.trim() ?? null,
              rating: rating != null && !Number.isNaN(rating) ? rating : null,
              reviewCount: null,
              lat: null,
              lng: null,
              openNow: null,
              priceLevel: null,
              source: 'apontador-headless',
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
