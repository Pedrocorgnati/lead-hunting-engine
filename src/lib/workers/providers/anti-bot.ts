import type { BrowserContext } from 'playwright'
import userAgentsPool from './user-agents.json'

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
  { width: 390, height: 844 },   // iPhone 14
  { width: 414, height: 896 },   // iPhone XR
  { width: 360, height: 800 },   // Android common
]

export function randomUA(): string {
  return userAgentsPool[Math.floor(Math.random() * userAgentsPool.length)]
}

export function randomViewport(): { width: number; height: number } {
  return VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)]
}

export async function humanDelay(minMs = 1000, maxMs = 4000): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
  await new Promise(r => setTimeout(r, delay))
}

export async function applyStealth(context: BrowserContext): Promise<void> {
  // Override navigator.webdriver to defeat basic bot detection
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] })
    Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en-US', 'en'] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).chrome = { runtime: {} }
  })
}

export function getProxyConfig(): { server: string } | undefined {
  const proxyUrl = process.env.RESIDENTIAL_PROXY_URL
  if (!proxyUrl) return undefined
  return { server: proxyUrl }
}

export function isHeadlessEnabled(): boolean {
  return process.env.HEADLESS_ENABLED !== 'false'
}
