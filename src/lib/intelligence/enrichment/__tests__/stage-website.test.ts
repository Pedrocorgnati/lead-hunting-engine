/**
 * Testes do stage de presenca web — quick win do HTML (blacksmith 06-11,
 * Task 2 / criterios 2-3 do doc): siteHtml e calculado ANTES de discoverEmails
 * e entra como fonte de candidatos; sem HTML o comportamento e identico ao
 * legado (regressao obrigatoria).
 */

import { stageWebsitePresence } from '../stage-website'
import type { RawLeadInput } from '@/lib/workers/utils/data-normalizer'

function makeRaw(overrides: Partial<RawLeadInput> = {}): RawLeadInput {
  return {
    externalId: 'ext-1',
    name: 'Padaria Teste',
    source: 'GOOGLE_MAPS',
    rawJson: {},
    ...overrides,
  }
}

describe('stageWebsitePresence — quick win do HTML (Task 2)', () => {
  it('e-mail presente APENAS no HTML produz metadata.emailPrimary', async () => {
    // Entidade &#64; so e decodificada pela extracao de HTML — o traversal do
    // rawJson (regex literal) NAO encontra este candidato, garantindo que a
    // descoberta veio mesmo do siteHtml.
    const raw = makeRaw({
      website: 'https://empresa.com.br',
      rawJson: {
        siteHtml: '<footer>Fale conosco: contato&#64;empresa.com.br</footer>',
      },
    })

    const result = await stageWebsitePresence(raw)

    expect(result.metadata.emailPrimary).toBe('contato@empresa.com.br')
    expect(result.sources).toContain('site_html')
    expect(result.metadata.emailDomainClass).toBe('canonical')
  })

  it('regressao: sem HTML e sem e-mail, resultado identico ao legado', async () => {
    const raw = makeRaw({
      website: 'https://empresa.com.br',
      siteReachable: true,
      siteMobileFriendly: true,
    })

    const result = await stageWebsitePresence(raw)

    // Scoring legado intacto: 40 (website) + 20 (https) + 20 (reachable) + 20 (mobile)
    expect(result.score).toBe(100)
    expect(result.metadata).toEqual({
      hasWebsite: true,
      hasSsl: true,
      siteReachable: true,
      mobileFriendly: true,
    })
    expect(result.sources).toEqual(['raw_lead_data'])
  })

  it('regressao: e-mail no rawJson sem HTML continua produzindo o mesmo emailPrimary', async () => {
    const raw = makeRaw({
      rawJson: { email: 'contato@padaria.com.br' },
    })

    const result = await stageWebsitePresence(raw)

    expect(result.metadata.emailPrimary).toBe('contato@padaria.com.br')
    expect(result.sources).toContain('raw_json')
    expect(result.sources).not.toContain('site_html')
    // Sem websiteUrl utilizavel a classe de dominio e 'unknown' (legado).
    expect(result.metadata.emailDomainClass).toBe('unknown')
    // Sem HTML nem loadTime nao ha analise de UX.
    expect(result.metadata.uxScore).toBeUndefined()
  })

  it('e-mail em rawJson E HTML simultaneos: dominio canonico vence o generico externo', async () => {
    // Caso QA do doc (criterios 6-7): contato@plataforma.com (rodape de
    // agencia, no rawJson) NAO pode vencer o e-mail do dominio do lead
    // descoberto no HTML quando o site e empresa.com.br.
    const raw = makeRaw({
      website: 'https://empresa.com.br',
      rawJson: {
        email: 'contato@plataforma.com',
        siteHtml: '<a href="mailto:joao&#64;empresa.com.br">Fale com o Joao</a>',
      },
    })

    const result = await stageWebsitePresence(raw)

    expect(result.metadata.emailPrimary).toBe('joao@empresa.com.br')
    expect(result.metadata.emailSecondary).toContain('contato@plataforma.com')
    expect(result.metadata.emailDomainClass).toBe('canonical')
    expect(result.sources).toEqual(expect.arrayContaining(['raw_json', 'site_html']))
  })

  it('siteHtml continua alimentando a analise de UX apos a reordenacao', async () => {
    const raw = makeRaw({
      rawJson: { siteHtml: '<html><body><h1>Oi</h1></body></html>' },
    })

    const result = await stageWebsitePresence(raw)

    expect(typeof result.metadata.uxScore).toBe('number')
    expect(result.metadata.uxSignals).toBeDefined()
  })
})
