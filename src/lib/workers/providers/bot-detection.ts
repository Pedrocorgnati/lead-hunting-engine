const BLOCK_PATTERNS = [
  /captcha/i,
  /unusual traffic/i,
  /access denied/i,
  /blocked/i,
  /rate limit/i,
  /too many requests/i,
  /forbidden/i,
  /verify you are human/i,
  /bot detection/i,
  /challenge/i,
]

const BLOCK_STATUSES = new Set([403, 429, 503])

export interface BlockResult {
  blocked: boolean
  reason: string
}

export function isBlocked(response: { status: number; body?: string }): BlockResult {
  if (BLOCK_STATUSES.has(response.status)) {
    return { blocked: true, reason: `HTTP ${response.status}` }
  }

  if (response.body) {
    for (const pattern of BLOCK_PATTERNS) {
      if (pattern.test(response.body)) {
        return { blocked: true, reason: `body match: ${pattern.source}` }
      }
    }
  }

  return { blocked: false, reason: '' }
}

export function isCaptcha(body: string): boolean {
  return /captcha|recaptcha|hcaptcha/i.test(body)
}
