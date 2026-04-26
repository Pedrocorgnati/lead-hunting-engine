/**
 * E-commerce detector — TASK-3 intake-review (CL-059)
 *
 * Detecta presenca de e-commerce real e identifica a plataforma.
 * Puro, opera sobre HTML capturado.
 */

export type EcommercePlatform =
  | 'shopify'
  | 'woocommerce'
  | 'vtex'
  | 'nuvemshop'
  | 'lojaintegrada'
  | 'tray'
  | 'magento'
  | 'generic'

export interface EcommerceDetectorInput {
  html?: string | null
  url?: string | null
}

export interface EcommerceDetectorResult {
  hasEcommerce: boolean
  platform: EcommercePlatform | null
  evidence: string[]
}

const PLATFORM_MARKERS: Array<{ platform: EcommercePlatform; re: RegExp; tag: string }> = [
  { platform: 'shopify', re: /cdn\.shopify\.com|Shopify\.theme|shopify-section/i, tag: 'shopify-asset' },
  { platform: 'woocommerce', re: /woocommerce|wc-ajax|wc_add_to_cart/i, tag: 'woocommerce-marker' },
  { platform: 'vtex', re: /vtex\.com\.br|vtexassets\.com|vtex-portal/i, tag: 'vtex-asset' },
  { platform: 'nuvemshop', re: /nuvemshop|tiendanube\.com/i, tag: 'nuvemshop-marker' },
  { platform: 'lojaintegrada', re: /lojaintegrada\.com\.br/i, tag: 'lojaintegrada-marker' },
  { platform: 'tray', re: /tray\.com\.br|traycheckout/i, tag: 'tray-marker' },
  { platform: 'magento', re: /Magento|mage\/cookies|magento_version/i, tag: 'magento-marker' },
]

const CART_MARKERS: Array<{ re: RegExp; tag: string }> = [
  { re: /href=["'][^"']*\/(cart|checkout|carrinho)[^"']*["']/i, tag: 'cart-link' },
  { re: /adicionar\s+ao\s+carrinho/i, tag: 'text-adicionar-carrinho' },
  { re: /data-cart|data-add-to-cart|class=["'][^"']*add-to-cart[^"']*["']/i, tag: 'cart-attr' },
  { re: /comprar\s+agora|finalizar\s+compra/i, tag: 'text-comprar' },
]

export function detectEcommerce(input: EcommerceDetectorInput): EcommerceDetectorResult {
  const html = input.html ?? ''
  const url = input.url ?? ''
  const evidence: string[] = []

  if (!html && !url) {
    return { hasEcommerce: false, platform: null, evidence: [] }
  }

  let platform: EcommercePlatform | null = null
  for (const marker of PLATFORM_MARKERS) {
    if (marker.re.test(html) || marker.re.test(url)) {
      platform = marker.platform
      evidence.push(marker.tag)
      break
    }
  }

  for (const marker of CART_MARKERS) {
    if (marker.re.test(html)) evidence.push(marker.tag)
  }

  const cartSignalCount = evidence.filter((e) => e.startsWith('cart-') || e.startsWith('text-')).length
  const hasEcommerce = platform !== null || cartSignalCount >= 2

  // Se ha sinais de carrinho mas sem plataforma identificada, marca como 'generic'
  if (hasEcommerce && platform === null) platform = 'generic'

  return { hasEcommerce, platform, evidence }
}
