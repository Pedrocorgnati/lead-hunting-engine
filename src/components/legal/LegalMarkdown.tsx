/**
 * Renderer server-only minimalista para documentos legais versionados.
 * Conteúdo é controlado (arquivos `src/content/legal/*.md` do próprio repo).
 * Suporta apenas o subset usado: headings H1-H3, parágrafos, listas UL/OL,
 * blockquote, hr, negrito, itálico, código inline e links.
 */

import React from 'react'

type InlineNode = string | React.ReactElement

const ANCHOR_IN_HEADING = /\s\{#([a-zA-Z0-9_-]+)\}\s*$/

function renderInline(text: string, keyPrefix: string): InlineNode[] {
  const nodes: InlineNode[] = []
  let index = 0
  let buffer = ''
  let keyCounter = 0

  const flushBuffer = () => {
    if (buffer) {
      nodes.push(buffer)
      buffer = ''
    }
  }

  const nextKey = () => `${keyPrefix}-${keyCounter++}`

  while (index < text.length) {
    const remaining = text.slice(index)

    const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)/.exec(remaining)
    if (linkMatch) {
      flushBuffer()
      const label = linkMatch[1]
      const href = linkMatch[2]
      const isExternal = /^https?:\/\//.test(href)
      nodes.push(
        <a
          key={nextKey()}
          href={href}
          className="text-primary hover:underline"
          {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {renderInline(label, `${keyPrefix}-a${keyCounter}`)}
        </a>,
      )
      index += linkMatch[0].length
      continue
    }

    const boldMatch = /^\*\*([^*]+)\*\*/.exec(remaining)
    if (boldMatch) {
      flushBuffer()
      nodes.push(
        <strong key={nextKey()} className="font-semibold text-foreground">
          {renderInline(boldMatch[1], `${keyPrefix}-b${keyCounter}`)}
        </strong>,
      )
      index += boldMatch[0].length
      continue
    }

    const italicMatch = /^\*([^*\n]+)\*/.exec(remaining)
    if (italicMatch) {
      flushBuffer()
      nodes.push(
        <em key={nextKey()} className="italic">
          {renderInline(italicMatch[1], `${keyPrefix}-i${keyCounter}`)}
        </em>,
      )
      index += italicMatch[0].length
      continue
    }

    const codeMatch = /^`([^`]+)`/.exec(remaining)
    if (codeMatch) {
      flushBuffer()
      nodes.push(
        <code
          key={nextKey()}
          className="rounded bg-muted px-1 py-0.5 text-[0.85em] font-mono"
        >
          {codeMatch[1]}
        </code>,
      )
      index += codeMatch[0].length
      continue
    }

    buffer += text[index]
    index += 1
  }

  flushBuffer()
  return nodes
}

interface Block {
  kind: 'h1' | 'h2' | 'h3' | 'p' | 'ul' | 'ol' | 'hr' | 'blockquote'
  content?: string
  items?: string[]
  anchorId?: string
}

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.split('\n')
  const blocks: Block[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      i += 1
      continue
    }

    if (/^---\s*$/.test(line)) {
      blocks.push({ kind: 'hr' })
      i += 1
      continue
    }

    const h1 = /^#\s+(.+)$/.exec(line)
    if (h1) {
      blocks.push({ kind: 'h1', content: h1[1] })
      i += 1
      continue
    }

    const h2 = /^##\s+(.+)$/.exec(line)
    if (h2) {
      let heading = h2[1]
      let anchorId: string | undefined
      const anchor = heading.match(ANCHOR_IN_HEADING)
      if (anchor) {
        anchorId = anchor[1]
        heading = heading.replace(ANCHOR_IN_HEADING, '').trim()
      }
      blocks.push({ kind: 'h2', content: heading, anchorId })
      i += 1
      continue
    }

    const h3 = /^###\s+(.+)$/.exec(line)
    if (h3) {
      blocks.push({ kind: 'h3', content: h3[1] })
      i += 1
      continue
    }

    if (/^>\s?/.test(line)) {
      const collected: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        collected.push(lines[i].replace(/^>\s?/, ''))
        i += 1
      }
      blocks.push({ kind: 'blockquote', content: collected.join(' ').trim() })
      continue
    }

    if (/^-\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^-\s+/.test(lines[i])) {
        const item = lines[i].replace(/^-\s+/, '')
        const buf = [item]
        let j = i + 1
        while (j < lines.length && /^\s{2,}/.test(lines[j])) {
          buf.push(lines[j].trim())
          j += 1
        }
        items.push(buf.join(' '))
        i = j
      }
      blocks.push({ kind: 'ul', items })
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''))
        i += 1
      }
      blocks.push({ kind: 'ol', items })
      continue
    }

    const paragraph: string[] = [line]
    let j = i + 1
    while (j < lines.length && lines[j].trim() && !/^(#{1,3}\s|>|-\s|\d+\.\s|---)/.test(lines[j])) {
      paragraph.push(lines[j])
      j += 1
    }
    blocks.push({ kind: 'p', content: paragraph.join(' ') })
    i = j
  }

  return blocks
}

interface LegalMarkdownProps {
  source: string
}

export function LegalMarkdown({ source }: LegalMarkdownProps) {
  const blocks = parseBlocks(source)

  return (
    <article className="prose prose-slate dark:prose-invert max-w-none text-sm leading-relaxed">
      {blocks.map((block, index) => {
        const key = `legal-block-${index}`
        switch (block.kind) {
          case 'h1':
            return (
              <h1 key={key} className="text-3xl font-bold text-foreground mb-6 mt-2">
                {renderInline(block.content ?? '', key)}
              </h1>
            )
          case 'h2':
            return (
              <h2
                key={key}
                id={block.anchorId}
                className="text-xl font-semibold text-foreground mt-8 mb-3 scroll-mt-20"
              >
                {renderInline(block.content ?? '', key)}
              </h2>
            )
          case 'h3':
            return (
              <h3 key={key} className="text-lg font-semibold text-foreground mt-6 mb-2">
                {renderInline(block.content ?? '', key)}
              </h3>
            )
          case 'p':
            return (
              <p key={key} className="text-muted-foreground mb-4">
                {renderInline(block.content ?? '', key)}
              </p>
            )
          case 'ul':
            return (
              <ul key={key} className="list-disc pl-6 space-y-2 mb-4 text-muted-foreground">
                {block.items?.map((item, itemIdx) => (
                  <li key={`${key}-li-${itemIdx}`}>{renderInline(item, `${key}-li-${itemIdx}`)}</li>
                ))}
              </ul>
            )
          case 'ol':
            return (
              <ol key={key} className="list-decimal pl-6 space-y-2 mb-4 text-muted-foreground">
                {block.items?.map((item, itemIdx) => (
                  <li key={`${key}-li-${itemIdx}`}>{renderInline(item, `${key}-li-${itemIdx}`)}</li>
                ))}
              </ol>
            )
          case 'blockquote':
            return (
              <blockquote
                key={key}
                className="border-l-4 border-muted-foreground/30 pl-4 italic text-muted-foreground my-4"
              >
                {renderInline(block.content ?? '', key)}
              </blockquote>
            )
          case 'hr':
            return <hr key={key} className="my-8 border-muted" />
          default:
            return null
        }
      })}
    </article>
  )
}
