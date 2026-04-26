import type { Page } from 'playwright'
import { HeadlessScraper } from '../headless-scraper'
import { humanDelay } from '../anti-bot'
import type { BusinessResult } from '../types'

const YELP_BASE = 'https://www.yelp.com/search'

export class YelpStrategy {
  private scraper = new HeadlessScraper()

  async search(term: string, location: string, maxResults = 20): Promise<BusinessResult[]> {
    await this.scraper.launch()

    try {
      return await this.scraper.withPage(async (page: Page) => {
        const url = `${YELP_BASE}?find_desc=${encodeURIComponent(term)}&find_loc=${encodeURIComponent(location)}`
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        await humanDelay(2000, 4000)

        // Scroll to load results
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => window.scrollBy(0, 600))
          await humanDelay(700, 1200)
        }

        const cards = await page.locator('[data-testid="serp-ia-card"]').all()
        const results: BusinessResult[] = []

        for (const card of cards.slice(0, maxResults)) {
          try {
            const name = await card.locator('a[name]').first().textContent({ timeout: 2000 }) ?? ''
            if (!name.trim()) continue

            const address = await card.locator('address').textContent({ timeout: 1000 }).catch(() => null)
            const phone = await card.locator('[href^="tel:"]').getAttribute('href', { timeout: 1000 })
              .catch(() => null)
            const website = await card.locator('a[href*="biz_website"]').getAttribute('href', { timeout: 1000 })
              .catch(() => null)
            const ratingText = await card.locator('[aria-label*="star rating"]').getAttribute('aria-label', { timeout: 1000 })
              .catch(() => null)
            const rating = ratingText ? parseFloat(ratingText.split(' ')[0]) : null

            results.push({
              externalId: `yelp-headless:${name.trim()}:${address ?? ''}`,
              name: name.trim(),
              address: address?.trim() ?? null,
              city: location,
              state: null,
              phone: phone?.replace('tel:', '').trim() ?? null,
              website: website ?? null,
              category: null,
              rating,
              reviewCount: null,
              lat: null,
              lng: null,
              openNow: null,
              priceLevel: null,
              source: 'yelp-headless',
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
