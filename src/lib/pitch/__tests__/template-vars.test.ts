import {
  renderTemplateVars,
  renderPitch,
  leadProblemPhrase,
  buildLeadVars,
  TEMPLATE_PLACEHOLDER_KEYS,
} from '../template-vars'

const SENDER = { name: 'Pedro Corgnati', company: 'Corgnati Tech', whatsapp: '(12) 99999-9999', portfolio: 'corgnati.com' }

describe('template-vars', () => {
  it('substitui placeholders de lead e remetente', () => {
    const out = renderPitch(
      'Olá, {{empresa}} de {{cidade}} ({{segmento}})! Notei que {{problema}}. — {{meu_nome}}, {{meu_whatsapp}}',
      { businessName: 'Clínica Santa Maria', city: 'Lorena', niche: 'clínica médica', website: null, opportunities: ['A_NEEDS_SITE'] },
      SENDER,
    )
    expect(out).toBe('Olá, Clínica Santa Maria de Lorena (clínica médica)! Notei que vocês ainda não têm um site próprio aparecendo no perfil. — Pedro Corgnati, (12) 99999-9999')
  })

  it('problema é observação factual por oportunidade', () => {
    expect(leadProblemPhrase({ website: null })).toMatch(/site próprio/)
    expect(leadProblemPhrase({ website: 'x.com', opportunities: ['B_NEEDS_SYSTEM'] })).toMatch(/agenda|sistema/)
    expect(leadProblemPhrase({ website: 'x.com', opportunities: ['D_NEEDS_ECOMMERCE'] })).toMatch(/online/)
  })

  it('defaults seguros quando o lead não tem dados', () => {
    const v = buildLeadVars({})
    expect(v.empresa).toBe('seu negócio')
    expect(v.cidade).toBe('sua região')
    expect(v.segmento).toBe('negócios locais')
  })

  it('placeholder desconhecido fica literal; conhecido vazio vira string vazia', () => {
    expect(renderTemplateVars('a {{desconhecido}} b', {})).toBe('a {{desconhecido}} b')
    expect(renderTemplateVars('wpp: {{meu_whatsapp}}', { meu_whatsapp: '' })).toBe('wpp: ')
  })

  it('vocabulário canônico inclui lead + remetente', () => {
    for (const k of ['empresa', 'cidade', 'segmento', 'problema', 'meu_nome', 'meu_whatsapp', 'meu_portfolio']) {
      expect(TEMPLATE_PLACEHOLDER_KEYS).toContain(k)
    }
  })
})
