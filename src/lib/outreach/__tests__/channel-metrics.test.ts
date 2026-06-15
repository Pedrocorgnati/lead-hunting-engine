/**
 * channel-metrics (blacksmith 06-11, Task 5 — criterios 17/19): metricas de
 * canal sem maquiagem. Prova as separacoes encontrado/util e detectado/
 * enviavel, e a regra inviolavel: 'probable' NUNCA conta como WhatsApp
 * detectado-confirmado.
 */
// channel-metrics importa constantes do channel-orchestrator, que importa
// @/lib/prisma — mock inerte para nao instanciar client em teste unitario.
jest.mock('@/lib/prisma', () => ({
  prisma: {
    contactEvent: { findFirst: jest.fn() },
    lead: { findUnique: jest.fn() },
    outreachDispatch: { findFirst: jest.fn() },
  },
}))

import { resolveWhatsappLevel, computeChannelFacts, summarizeChannelCoverage } from '../channel-metrics'
import { CHANNELS_WITH_TRANSPORT } from '../channel-orchestrator'

const MOBILE_BR = '+5511999998888'
const FIXED_BR = '+5511333334444'

function whatsappBlock(level: 'confirmed' | 'probable' | 'unknown') {
  return {
    whatsapp: {
      level,
      confidence: level === 'confirmed' ? 0.9 : 0,
      evidence: level === 'confirmed' ? ['wa.me-link'] : [],
      number: null,
      numberDivergesFromPhone: null,
      source: level === 'confirmed' ? 'site_html' : 'phone_classifier',
      detectedAt: '2026-06-11T00:00:00.000Z',
    },
  }
}

describe('resolveWhatsappLevel', () => {
  it("'confirmed' via bloco canonico do enrichmentData", () => {
    expect(
      resolveWhatsappLevel({
        isWhatsappChannel: null,
        phoneNormalized: FIXED_BR,
        enrichmentData: whatsappBlock('confirmed'),
      }),
    ).toBe('confirmed')
  })

  it('bloco canonico tem prioridade sobre o fallback legado (probable nao vira confirmed)', () => {
    // isWhatsappChannel=true (legado) mas o contrato diz 'probable':
    // o bloco vence — nunca promover probable a confirmed por flag antiga.
    expect(
      resolveWhatsappLevel({
        isWhatsappChannel: true,
        phoneNormalized: MOBILE_BR,
        enrichmentData: whatsappBlock('probable'),
      }),
    ).toBe('probable')
  })

  it("fallback legado: isWhatsappChannel === true => 'confirmed' sem bloco", () => {
    expect(
      resolveWhatsappLevel({ isWhatsappChannel: true, phoneNormalized: null, enrichmentData: null }),
    ).toBe('confirmed')
  })

  it("'probable' via fallback de celular BR (classifyBRPhone mobile)", () => {
    expect(
      resolveWhatsappLevel({ isWhatsappChannel: null, phoneNormalized: MOBILE_BR, enrichmentData: null }),
    ).toBe('probable')
  })

  it("'unknown' com telefone fixo BR", () => {
    expect(
      resolveWhatsappLevel({ isWhatsappChannel: false, phoneNormalized: FIXED_BR, enrichmentData: null }),
    ).toBe('unknown')
  })

  it("'unknown' sem telefone e sem sinais", () => {
    expect(resolveWhatsappLevel({})).toBe('unknown')
  })
})

describe('computeChannelFacts — e-mail encontrado vs e-mail util (criterio 17)', () => {
  it('hasUsefulEmail=false quando e-mail esta ausente', () => {
    const facts = computeChannelFacts({ email: null })
    expect(facts.hasEmail).toBe(false)
    expect(facts.hasUsefulEmail).toBe(false)
  })

  it('hasUsefulEmail=false para e-mail com forma invalida (encontrado mas nao util)', () => {
    const facts = computeChannelFacts({ email: 'sem-arroba.com' })
    expect(facts.hasEmail).toBe(true)
    expect(facts.hasUsefulEmail).toBe(false)
  })

  it('hasUsefulEmail=true para contato@ valido (generico conta como util — hardValid)', () => {
    const facts = computeChannelFacts({ email: 'contato@empresa.com.br' })
    expect(facts.hasEmail).toBe(true)
    expect(facts.hasUsefulEmail).toBe(true)
  })
})

describe('computeChannelFacts — detectado vs enviavel (criterios 17/19)', () => {
  it("'probable' NUNCA entra em detectedChannels (regra inviolavel)", () => {
    const facts = computeChannelFacts({
      email: null,
      phoneNormalized: MOBILE_BR,
      enrichmentData: null,
    })
    expect(facts.whatsappLevel).toBe('probable')
    expect(facts.detectedChannels).not.toContain('WHATSAPP')
    expect(facts.sendableChannels).not.toContain('WHATSAPP')
    expect(facts.bestDetectedChannel).toBeNull()
  })

  it("'confirmed' entra como detectado mas NUNCA como enviavel enquanto so EMAIL tem transporte", () => {
    // Sanity do pre-requisito do teste: transporte real hoje e so EMAIL.
    expect(CHANNELS_WITH_TRANSPORT).toEqual(['EMAIL'])

    const facts = computeChannelFacts({
      email: 'contato@empresa.com.br',
      enrichmentData: whatsappBlock('confirmed'),
    })
    expect(facts.whatsappLevel).toBe('confirmed')
    expect(facts.detectedChannels).toEqual(['EMAIL', 'WHATSAPP'])
    expect(facts.sendableChannels).toEqual(['EMAIL'])
    expect(facts.bestDetectedChannel).toBe('EMAIL')
    expect(facts.bestSendableChannel).toBe('EMAIL')
  })

  it('LINKEDIN nunca aparece como detectado nem enviavel (sem fonte confiavel de sinal)', () => {
    const facts = computeChannelFacts({
      email: 'contato@empresa.com.br',
      enrichmentData: whatsappBlock('confirmed'),
    })
    expect(facts.detectedChannels).not.toContain('LINKEDIN')
    expect(facts.sendableChannels).not.toContain('LINKEDIN')
  })

  it('WhatsApp confirmado sem e-mail: detectado, mas nada enviavel (sem transporte)', () => {
    const facts = computeChannelFacts({
      email: null,
      isWhatsappChannel: true,
      enrichmentData: null,
    })
    expect(facts.detectedChannels).toEqual(['WHATSAPP'])
    expect(facts.bestDetectedChannel).toBe('WHATSAPP')
    expect(facts.sendableChannels).toEqual([])
    expect(facts.bestSendableChannel).toBeNull()
  })

  it('e-mail malformado: EMAIL detectado (encontrado) mas NAO enviavel (gate hardValid)', () => {
    const facts = computeChannelFacts({ email: 'sem-arroba.com' })
    expect(facts.detectedChannels).toEqual(['EMAIL'])
    expect(facts.sendableChannels).toEqual([])
    expect(facts.bestSendableChannel).toBeNull()
  })

  it('lead sem nenhum sinal: listas vazias e bests nulos', () => {
    const facts = computeChannelFacts({})
    expect(facts.detectedChannels).toEqual([])
    expect(facts.sendableChannels).toEqual([])
    expect(facts.bestDetectedChannel).toBeNull()
    expect(facts.bestSendableChannel).toBeNull()
    expect(facts.whatsappLevel).toBe('unknown')
  })
})

describe('summarizeChannelCoverage (review 06-11 R1-1/R1-2 — cobertura sem maquiagem)', () => {
  it('separa WhatsApp confirmado de provavel — provavel NUNCA conta como confirmado', () => {
    const summary = summarizeChannelCoverage([
      // confirmado via bloco canonico
      { phone: '(11) 3333-4444', enrichmentData: whatsappBlock('confirmed') },
      // provavel via celular BR (phoneNormalized)
      { phone: '(11) 99999-8888', phoneNormalized: MOBILE_BR, enrichmentData: null },
      // fixo => unknown, nao conta em nenhum dos dois
      { phone: '(11) 3333-4444', phoneNormalized: FIXED_BR, enrichmentData: null },
      // sem telefone, sem sinais
      { phone: null, enrichmentData: null },
    ])
    expect(summary.withPhone).toBe(3)
    expect(summary.withWhatsappConfirmed).toBe(1)
    expect(summary.withWhatsappProbable).toBe(1)
  })

  it('lead legado sem phoneNormalized usa toE164(phone) como fallback (paridade com a metrica antiga)', () => {
    const summary = summarizeChannelCoverage([
      { phone: '(11) 99999-8888', phoneNormalized: null, enrichmentData: null },
    ])
    expect(summary.withWhatsappProbable).toBe(1)
    expect(summary.withWhatsappConfirmed).toBe(0)
  })

  it('separa e-mail encontrado de e-mail util (criterio 17)', () => {
    const summary = summarizeChannelCoverage([
      { email: 'contato@empresa.com.br' },
      { email: 'sem-arroba.com' }, // encontrado, mas nao util
      { email: null },
    ])
    expect(summary.withEmail).toBe(2)
    expect(summary.withUsefulEmail).toBe(1)
  })

  it('lista vazia: todos os contadores zerados', () => {
    expect(summarizeChannelCoverage([])).toEqual({
      withPhone: 0,
      withWhatsappConfirmed: 0,
      withWhatsappProbable: 0,
      withEmail: 0,
      withUsefulEmail: 0,
    })
  })
})
