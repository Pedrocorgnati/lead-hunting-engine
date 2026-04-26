import { MessageCircle, ShoppingBag, BarChart3 } from 'lucide-react'

/**
 * TASK-3 intake-review (ST005): badges de sinais estruturados do lead.
 * Exibe WhatsApp, E-commerce e Analytics Pixels quando presentes.
 */

const PIXEL_LABELS: Record<string, string> = {
  ga4: 'GA4',
  'ga-universal': 'GA Universal',
  meta: 'Meta Pixel',
  tiktok: 'TikTok',
  hotjar: 'Hotjar',
  gtm: 'GTM',
  clarity: 'Clarity',
  linkedin: 'LinkedIn',
}

const PLATFORM_LABELS: Record<string, string> = {
  shopify: 'Shopify',
  woocommerce: 'WooCommerce',
  vtex: 'VTEX',
  nuvemshop: 'Nuvemshop',
  lojaintegrada: 'Loja Integrada',
  tray: 'Tray',
  magento: 'Magento',
  generic: 'E-commerce',
}

export interface LeadSignalsProps {
  isWhatsappChannel?: boolean | null
  hasEcommerce?: boolean | null
  ecommercePlatform?: string | null
  analyticsPixels?: string[] | null
}

export function LeadSignals({
  isWhatsappChannel,
  hasEcommerce,
  ecommercePlatform,
  analyticsPixels,
}: LeadSignalsProps) {
  const hasAny =
    isWhatsappChannel === true ||
    hasEcommerce === true ||
    (analyticsPixels && analyticsPixels.length > 0)

  if (!hasAny) return null

  return (
    <div data-testid="lead-signals" className="flex flex-wrap items-center gap-2">
      {isWhatsappChannel === true && (
        <span
          data-testid="signal-badge-whatsapp"
          className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 px-2 py-1 text-xs font-medium dark:bg-green-900/40 dark:text-green-300"
        >
          <MessageCircle className="h-3 w-3" aria-hidden="true" />
          WhatsApp
        </span>
      )}

      {hasEcommerce === true && (
        <span
          data-testid="signal-badge-ecommerce"
          className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-800 px-2 py-1 text-xs font-medium dark:bg-blue-900/40 dark:text-blue-300"
        >
          <ShoppingBag className="h-3 w-3" aria-hidden="true" />
          E-commerce{ecommercePlatform ? `: ${PLATFORM_LABELS[ecommercePlatform] ?? ecommercePlatform}` : ''}
        </span>
      )}

      {analyticsPixels && analyticsPixels.length > 0 && (
        <span
          data-testid="signal-badge-pixels"
          className="inline-flex items-center gap-1 rounded-full bg-muted text-foreground px-2 py-1 text-xs font-medium"
        >
          <BarChart3 className="h-3 w-3" aria-hidden="true" />
          Pixels: {analyticsPixels.map((p) => PIXEL_LABELS[p] ?? p).join(', ')}
        </span>
      )}
    </div>
  )
}
