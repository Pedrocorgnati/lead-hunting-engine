import DOMPurify from 'dompurify'

export function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') {
    return html.replace(/<[^>]*>/g, '')
  }
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
}

export function sanitizeText(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim()
}
